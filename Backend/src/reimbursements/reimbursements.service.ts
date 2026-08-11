import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { Reimbursement } from './reimbursement.entity';
import { PayrollNotifierService } from './payroll-notifier.service';
import {
  CreateClaimForEmployeeDto,
  CreateReimbursementDto,
  ReimbursementFiltersDto,
  UpdateReimbursementDto,
} from './dto/reimbursement.dto';

/**
 * What the payroll engine gets back when it asks "what does this employee have
 * to be reimbursed this period?" — a total plus the claims that make it up, so
 * the payslip line can carry a readable "Why?" note and `persist` knows exactly
 * which rows to mark `paid`.
 */
export interface ReimbursementResolution {
  total: number;
  count: number;
  items: Reimbursement[];
  ids: string[];
  detail: string;
}

/**
 * Employee expense claims. Owns the claim lifecycle end to end (submit →
 * approve/reject → paid) plus the two engine-facing entry points:
 * `resolveForPeriod` (read-only, used by preview) and `markPaid` (mutating,
 * called once a payslip is committed).
 */
@Injectable()
export class ReimbursementsService {
  constructor(
    @InjectRepository(Reimbursement)
    private readonly repository: Repository<Reimbursement>,
    private readonly notifier: PayrollNotifierService,
  ) {}

  // ---- Org-wide (HR/Admin, permission-gated at the controller) -------------

  /** HR filing a claim on an employee's behalf. Still starts `pending`. */
  async create(dto: CreateClaimForEmployeeDto): Promise<Reimbursement> {
    return this.insert(dto.user_id, dto);
  }

  async findAll(filters: ReimbursementFiltersDto): Promise<Reimbursement[]> {
    const query = this.repository
      .createQueryBuilder('claim')
      .leftJoinAndSelect('claim.user', 'user')
      .orderBy('claim.expense_date', 'DESC')
      .addOrderBy('claim.created_at', 'DESC');

    if (filters.userId) {
      query.andWhere('claim.user_id = :userId', { userId: filters.userId });
    }
    if (filters.status) {
      query.andWhere('claim.status = :status', { status: filters.status });
    }
    if (filters.from) {
      query.andWhere('claim.expense_date >= :from', { from: filters.from });
    }
    if (filters.to) {
      query.andWhere('claim.expense_date <= :to', { to: filters.to });
    }

    return query.getMany();
  }

  async findOne(id: string): Promise<Reimbursement> {
    const claim = await this.repository.findOne({
      where: { reimbursement_id: id },
      relations: { user: true },
    });
    if (!claim) {
      throw new NotFoundException(`Reimbursement "${id}" not found.`);
    }
    return claim;
  }

  /**
   * Edit a claim's details. Blocked once a decision has been made — changing the
   * amount of an approved claim would silently change what payroll pays out, and
   * a `paid` claim is already reflected on a committed payslip.
   */
  async update(id: string, dto: UpdateReimbursementDto): Promise<Reimbursement> {
    const claim = await this.findOne(id);
    if (claim.status !== 'pending') {
      throw new BadRequestException(
        `Only a pending claim can be edited (this one is "${claim.status}").`,
      );
    }

    if (dto.title !== undefined) claim.title = dto.title;
    if (dto.category !== undefined) claim.category = dto.category;
    if (dto.amount !== undefined) claim.amount = dto.amount;
    if (dto.expense_date !== undefined) {
      claim.expense_date = new Date(dto.expense_date);
    }
    if (dto.description !== undefined) claim.description = dto.description ?? null;
    if (dto.receipt_url !== undefined) {
      claim.receipt_url = dto.receipt_url ?? null;
    }

    await this.repository.save(claim);
    return this.findOne(id);
  }

  /**
   * Delete a claim. A `paid` claim is deliberately undeletable: the payslip that
   * paid it is a permanent snapshot, and removing the claim would break the
   * audit trail that explains the payslip's reimbursement line.
   */
  async remove(id: string): Promise<{ message: string }> {
    const claim = await this.findOne(id);
    if (claim.status === 'paid') {
      throw new BadRequestException(
        'A paid claim cannot be deleted — it is recorded on a committed payslip.',
      );
    }
    await this.repository.delete(id);
    return { message: 'Reimbursement deleted successfully' };
  }

  // ---- Decisions ----------------------------------------------------------

  /**
   * Approve a pending claim. Approval does not pay anything by itself — the next
   * payroll run for a period containing the expense date picks it up and flips
   * it to `paid`.
   */
  async approve(
    id: string,
    deciderId: string,
    note?: string,
  ): Promise<Reimbursement> {
    return this.decide(id, 'approved', deciderId, note);
  }

  /** Reject a pending claim; payroll never sees it. */
  async reject(
    id: string,
    deciderId: string,
    note?: string,
  ): Promise<Reimbursement> {
    return this.decide(id, 'rejected', deciderId, note);
  }

  private async decide(
    id: string,
    status: 'approved' | 'rejected',
    deciderId: string,
    note?: string,
  ): Promise<Reimbursement> {
    const claim = await this.findOne(id);
    if (claim.status !== 'pending') {
      throw new BadRequestException(
        `Only a pending claim can be ${status} (this one is "${claim.status}").`,
      );
    }
    claim.status = status;
    claim.decided_by = deciderId;
    claim.decided_at = new Date();
    claim.decision_note = note ?? null;
    await this.repository.save(claim);

    await this.notifier.notifyDecision(
      'reimbursement',
      claim.reimbursement_id,
      claim.user_id,
      status,
      `${claim.title} — ${Number(claim.amount).toFixed(2)}`,
      note,
    );

    return this.findOne(id);
  }

  // ---- Self-service (token-scoped, no permission) --------------------------

  /**
   * An employee's own claim. `user_id` comes from the verified token — never the
   * body — and the status is forced to `pending`, so submitting a claim cannot
   * put money on a payslip until HR approves it.
   */
  async createMine(
    userId: string,
    dto: CreateReimbursementDto,
  ): Promise<Reimbursement> {
    return this.insert(userId, dto);
  }

  /** The signed-in employee's own claims, newest expense first. */
  findMine(userId: string): Promise<Reimbursement[]> {
    return this.repository.find({
      where: { user_id: userId },
      order: { expense_date: 'DESC', created_at: 'DESC' },
    });
  }

  /**
   * Withdraw an own claim, only while still `pending`. A 404 (not a 403) when
   * the claim belongs to someone else: the caller has no business learning that
   * a colleague's claim exists.
   */
  async removeMine(userId: string, id: string): Promise<{ message: string }> {
    const claim = await this.findOne(id);
    if (claim.user_id !== userId) {
      throw new NotFoundException(`Reimbursement "${id}" not found.`);
    }
    if (claim.status !== 'pending') {
      throw new BadRequestException(
        'Only a pending claim can be withdrawn. Contact HR to change a decided claim.',
      );
    }
    await this.repository.delete(id);
    return { message: 'Claim withdrawn successfully' };
  }

  // ---- Engine-facing -------------------------------------------------------

  /**
   * Read-only: the approved-but-unpaid claims this period should reimburse.
   *
   * Selection is by `expense_date`, not submission date, so a claim filed late
   * still lands against the period the expense belongs to. `paid_payslip_id IS
   * NULL` is what stops a claim being reimbursed twice — a regenerated payslip
   * re-resolves the same rows because `markPaid` is keyed off the period.
   *
   * Mutates nothing, so a preview never marks anything paid.
   */
  async resolveForPeriod(
    userId: string,
    periodStart: Date | string,
    periodEnd: Date | string,
    periodId?: string | null,
  ): Promise<ReimbursementResolution> {
    const from = toDateOnly(periodStart);
    const to = toDateOnly(periodEnd);

    const query = this.repository
      .createQueryBuilder('claim')
      .where('claim.user_id = :userId', { userId })
      .andWhere('claim.expense_date BETWEEN :from AND :to', { from, to })
      .orderBy('claim.expense_date', 'ASC');

    if (periodId) {
      // Approved-and-unpaid, plus anything *this* period already paid — a
      // re-run of the same period must reproduce the same payslip.
      query.andWhere(
        '(claim.status = :approved OR (claim.status = :paid AND claim.paid_period_id = :periodId))',
        { approved: 'approved', paid: 'paid', periodId },
      );
    } else {
      query.andWhere('claim.status = :approved', { approved: 'approved' });
    }

    const items = await query.getMany();

    const total = round2(items.reduce((sum, i) => sum + Number(i.amount), 0));
    const detail = items
      .map((i) => `${i.category} ${Number(i.amount).toFixed(2)}`)
      .join(' + ');

    return {
      total,
      count: items.length,
      items,
      ids: items.map((i) => i.reimbursement_id),
      detail,
    };
  }

  /**
   * Mutating: record that a payslip paid these claims. Called from `persist`
   * once the payslip is committed, with the payslip's `EntityManager` when one
   * is in play so the claim flip and the payslip share a transaction.
   *
   * Idempotent per period: re-running a period re-marks the same rows with the
   * new payslip id and never double-pays, because `resolveForPeriod` only picks
   * up unpaid claims plus the ones this same period already paid.
   */
  async markPaid(
    ids: string[],
    periodId: string,
    payslipId: string,
    manager?: EntityManager,
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const repo = manager
      ? manager.getRepository(Reimbursement)
      : this.repository;
    const result = await repo.update(
      { reimbursement_id: In(ids) },
      {
        status: 'paid',
        paid_period_id: periodId,
        paid_payslip_id: payslipId,
      },
    );
    return result.affected ?? 0;
  }

  /**
   * Release claims a period had paid, so a deleted/regenerated payslip does not
   * strand them as `paid` with no payslip behind them. Approved claims become
   * claimable again by the next run.
   */
  async releaseForPeriod(
    periodId: string,
    userId?: string,
    manager?: EntityManager,
  ): Promise<number> {
    const repo = manager
      ? manager.getRepository(Reimbursement)
      : this.repository;
    const where: Record<string, unknown> = {
      paid_period_id: periodId,
      status: 'paid',
    };
    if (userId) where.user_id = userId;
    const result = await repo.update(where, {
      status: 'approved',
      paid_period_id: null,
      paid_payslip_id: null,
    });
    return result.affected ?? 0;
  }

  // ---- Internal ------------------------------------------------------------

  private async insert(
    userId: string,
    dto: CreateReimbursementDto,
  ): Promise<Reimbursement> {
    if (dto.amount <= 0) {
      throw new BadRequestException('amount must be greater than 0.');
    }
    const claim = this.repository.create({
      user_id: userId,
      title: dto.title,
      category: dto.category ?? 'Other',
      amount: dto.amount,
      expense_date: new Date(dto.expense_date),
      description: dto.description ?? null,
      receipt_url: dto.receipt_url ?? null,
      status: 'pending',
    });
    const saved = await this.repository.save(claim);

    await this.notifier.notifySubmitted(
      'reimbursement',
      saved.reimbursement_id,
      userId,
      `${saved.title} — ${Number(saved.amount).toFixed(2)}`,
    );

    return saved;
  }
}

/** Postgres `date` columns compare as `YYYY-MM-DD`; normalise both bounds. */
function toDateOnly(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return new Date(
    Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()),
  )
    .toISOString()
    .slice(0, 10);
}

/** Money rounds to 2 dp; guards float drift when summing claims. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
