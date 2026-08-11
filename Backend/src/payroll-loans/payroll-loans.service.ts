import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { EmployeeLoan, LoanInstallment } from './payroll-loans.entity';
import { CreateEmployeeLoanDto } from './dto/create-employee-loan.dto';
import { UpdateEmployeeLoanDto } from './dto/update-employee-loan.dto';

/**
 * What the payroll engine gets back when it asks "how much loan should this
 * employee repay this period?" — a total plus a per-loan breakdown, each with
 * the "Why?" note material (loan name + resulting outstanding balance).
 */
export interface LoanDeductionLine {
  loan_id: string;
  loan_name: string;
  installment_id: string;
  amount: number;
  outstanding_before: number;
  outstanding_after: number;
}

export interface LoanDeductionResult {
  amount: number;
  lines: LoanDeductionLine[];
}

/**
 * Employee loans / salary advances (spec §9). Owns loan state end to end: CRUD,
 * schedule generation, and the two engine-facing entry points —
 * `resolveDeduction` (read-only, for preview) and `applyDeduction` (mutating,
 * idempotent per `(loan_id, period_id)`, called when a payslip is persisted).
 */
@Injectable()
export class PayrollLoansService {
  constructor(
    @InjectRepository(EmployeeLoan)
    private readonly loanRepository: Repository<EmployeeLoan>,
    @InjectRepository(LoanInstallment)
    private readonly installmentRepository: Repository<LoanInstallment>,
  ) {}

  async create(dto: CreateEmployeeLoanDto): Promise<EmployeeLoan> {
    if (dto.installment_amount <= 0) {
      throw new BadRequestException('installment_amount must be greater than 0.');
    }
    if (dto.installment_amount > dto.principal) {
      throw new BadRequestException(
        'installment_amount cannot exceed the principal.',
      );
    }
    const loan = this.loanRepository.create({
      user_id: dto.user_id,
      name: dto.name,
      principal: dto.principal,
      // A new loan starts fully outstanding.
      outstanding: dto.principal,
      installment_amount: dto.installment_amount,
      start_period_id: dto.start_period_id ?? null,
      status: dto.status ?? 'active',
      remarks: dto.remarks ?? null,
    });
    return this.loanRepository.save(loan);
  }

  findAll(userId?: string, status?: string): Promise<EmployeeLoan[]> {
    const where: Record<string, unknown> = {};
    if (userId) where.user_id = userId;
    if (status) where.status = status;
    return this.loanRepository.find({
      where,
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string): Promise<EmployeeLoan> {
    const loan = await this.loanRepository.findOne({
      where: { loan_id: id },
      relations: { installments: true },
    });
    if (!loan) {
      throw new NotFoundException(`Loan "${id}" not found.`);
    }
    loan.installments?.sort((a, b) => a.sequence - b.sequence);
    return loan;
  }

  async update(id: string, dto: UpdateEmployeeLoanDto): Promise<EmployeeLoan> {
    const loan = await this.findOne(id);

    if (dto.name !== undefined) loan.name = dto.name;
    if (dto.principal !== undefined) loan.principal = dto.principal;
    if (dto.installment_amount !== undefined) {
      loan.installment_amount = dto.installment_amount;
    }
    if (dto.start_period_id !== undefined) {
      loan.start_period_id = dto.start_period_id ?? null;
    }
    if (dto.status !== undefined) loan.status = dto.status;
    if (dto.remarks !== undefined) loan.remarks = dto.remarks ?? null;

    await this.loanRepository.save(loan);
    return this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findOne(id);
    // Installments cascade-delete via the FK.
    await this.loanRepository.delete(id);
    return { message: 'Loan deleted successfully' };
  }

  /**
   * Generate (or regenerate) the installment schedule from the loan's principal
   * and installment amount. Any not-yet-deducted installments are discarded and
   * rebuilt; installments already `deducted` in a payroll run are preserved so a
   * reschedule never rewrites history. The final installment absorbs the
   * rounding remainder so the sum of installments equals the principal exactly.
   */
  async schedule(id: string): Promise<EmployeeLoan> {
    const loan = await this.findOne(id);
    if (loan.installment_amount <= 0) {
      throw new BadRequestException(
        'Set a positive installment_amount before scheduling.',
      );
    }

    const deducted = (loan.installments ?? []).filter(
      (i) => i.status === 'deducted',
    );
    const paid = deducted.reduce((sum, i) => sum + Number(i.amount), 0);
    const remaining = round2(Number(loan.principal) - paid);

    // Drop any scheduled/skipped rows; keep the deducted history.
    await this.installmentRepository.delete({ loan_id: id });
    for (const kept of deducted) {
      kept.installment_id = undefined as unknown as string;
    }

    const fresh: LoanInstallment[] = [];
    let sequence = deducted.length;
    let balance = remaining;
    while (balance > 0.009) {
      sequence += 1;
      const amount = Math.min(loan.installment_amount, round2(balance));
      balance = round2(balance - amount);
      fresh.push(
        this.installmentRepository.create({
          loan_id: id,
          period_id: null,
          sequence,
          amount,
          status: 'scheduled',
          balance_after: balance,
        }),
      );
    }

    const rebuilt = [...deducted, ...fresh].map((row) =>
      this.installmentRepository.create({ ...row, loan_id: id }),
    );
    await this.installmentRepository.save(rebuilt);
    return this.findOne(id);
  }

  /**
   * Read-only: the loan deduction the engine should apply for this employee in
   * this period, without mutating anything. Used by the calculation preview.
   * Honors idempotency — if a period was already processed for a loan, the
   * already-recorded installment is what's reported, not a fresh one.
   */
  async resolveDeduction(
    userId: string,
    periodId: string | null,
  ): Promise<LoanDeductionResult> {
    const loans = await this.loanRepository.find({
      where: { user_id: userId, status: 'active' },
      relations: { installments: true },
    });

    const lines: LoanDeductionLine[] = [];
    for (const loan of loans) {
      const installment = this.pickInstallmentForPeriod(loan, periodId);
      if (!installment) continue;
      const amount = Number(installment.amount);
      const outstanding = Number(loan.outstanding);
      // If already deducted for this period the balance is post-deduction;
      // otherwise show what it will become.
      const alreadyDeducted = installment.status === 'deducted';
      const outstandingAfter = alreadyDeducted
        ? outstanding
        : round2(outstanding - amount);
      lines.push({
        loan_id: loan.loan_id,
        loan_name: loan.name,
        installment_id: installment.installment_id,
        amount,
        outstanding_before: alreadyDeducted
          ? round2(outstanding + amount)
          : outstanding,
        outstanding_after: outstandingAfter,
      });
    }

    const amount = round2(lines.reduce((sum, l) => sum + l.amount, 0));
    return { amount, lines };
  }

  /**
   * Mutating: record this period's loan deductions when a payslip is persisted.
   * Idempotent per `(loan_id, period_id)` — a re-run of the same period never
   * double-charges. Marks the installment `deducted`, decrements `outstanding`,
   * and closes the loan once fully repaid. Returns the same shape as
   * `resolveDeduction` so the caller can reconcile snapshot lines.
   */
  async applyDeduction(
    userId: string,
    periodId: string,
  ): Promise<LoanDeductionResult> {
    const loans = await this.loanRepository.find({
      where: { user_id: userId, status: 'active' },
      relations: { installments: true },
    });

    const lines: LoanDeductionLine[] = [];
    for (const loan of loans) {
      const existing = (loan.installments ?? []).find(
        (i) => i.period_id === periodId && i.status === 'deducted',
      );
      if (existing) {
        // Already processed for this period — report, don't re-deduct.
        const amount = Number(existing.amount);
        lines.push({
          loan_id: loan.loan_id,
          loan_name: loan.name,
          installment_id: existing.installment_id,
          amount,
          outstanding_before: round2(Number(loan.outstanding) + amount),
          outstanding_after: Number(loan.outstanding),
        });
        continue;
      }

      const next = this.pickNextScheduled(loan);
      if (!next) continue;

      const amount = Number(next.amount);
      const before = Number(loan.outstanding);
      const after = round2(before - amount);

      next.period_id = periodId;
      next.status = 'deducted';
      next.deducted_on = new Date();
      next.balance_after = after < 0 ? 0 : after;
      await this.installmentRepository.save(next);

      loan.outstanding = after < 0 ? 0 : after;
      if (loan.outstanding <= 0.009) {
        loan.outstanding = 0;
        loan.status = 'closed';
      }
      await this.loanRepository.save(loan);

      lines.push({
        loan_id: loan.loan_id,
        loan_name: loan.name,
        installment_id: next.installment_id,
        amount,
        outstanding_before: before,
        outstanding_after: loan.outstanding,
      });
    }

    const amount = round2(lines.reduce((sum, l) => sum + l.amount, 0));
    return { amount, lines };
  }

  /** The installment relevant to a period: the one already tied to it, else the next scheduled. */
  private pickInstallmentForPeriod(
    loan: EmployeeLoan,
    periodId: string | null,
  ): LoanInstallment | null {
    const installments = loan.installments ?? [];
    if (periodId) {
      const forPeriod = installments.find((i) => i.period_id === periodId);
      if (forPeriod) return forPeriod;
    }
    return this.pickNextScheduled(loan);
  }

  private pickNextScheduled(loan: EmployeeLoan): LoanInstallment | null {
    const scheduled = (loan.installments ?? [])
      .filter((i) => i.status === 'scheduled')
      .sort((a, b) => a.sequence - b.sequence);
    return scheduled[0] ?? null;
  }
}

/** Money rounds to 2 dp; guards float drift from repeated subtraction. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
