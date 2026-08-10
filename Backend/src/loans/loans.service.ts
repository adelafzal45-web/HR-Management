import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Loan } from './loan.entity';
import { LoanInstallment } from './loan-installment.entity';

import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto } from './dto/update-loan.dto';
import { SkipLoanInstallmentDto } from './dto/skip-loan-installment.dto';

import { LoanStatus } from './enums/loan-status.enum';
import { LoanInstallmentStatus } from './enums/loan-installment-status.enum';

@Injectable()
export class LoansService {
  constructor(
    @InjectRepository(Loan)
    private readonly loanRepository: Repository<Loan>,

    @InjectRepository(LoanInstallment)
    private readonly installmentRepository: Repository<LoanInstallment>,
  ) {}

  // ==========================================
  // CREATE LOAN
  // ==========================================

  async create(dto: CreateLoanDto, approvedById: string) {
    if (
      dto.installment_amount * dto.total_installments <
      dto.principal_amount
    ) {
      throw new BadRequestException(
        'Installment plan does not cover the principal amount.',
      );
    }

    const loan = this.loanRepository.create({
      user_id: dto.user_id,
      principal_amount: dto.principal_amount,
      installment_amount: dto.installment_amount,
      total_installments: dto.total_installments,
      paid_installments: 0,
      remaining_amount: dto.principal_amount,
      start_date: new Date(dto.start_date),
      reason: dto.reason,
      approved_by_id: approvedById,
      status: LoanStatus.ACTIVE,
    });

    const savedLoan = await this.loanRepository.save(loan);

    await this.generateInstallments(savedLoan);

    return this.findOne(savedLoan.loan_id);
  }

  // ==========================================
  // GENERATE INSTALLMENTS
  // ==========================================

  private async generateInstallments(loan: Loan) {
    const installments: LoanInstallment[] = [];

    const startDate = new Date(loan.start_date);

    for (let i = 1; i <= loan.total_installments; i++) {
      const dueDate = new Date(startDate);

      dueDate.setMonth(
        dueDate.getMonth() + (i - 1),
      );

      installments.push(
        this.installmentRepository.create({
          loan_id: loan.loan_id,
          installment_number: i,
          amount: loan.installment_amount,
          due_date: dueDate,
          status: LoanInstallmentStatus.PENDING,
        }),
      );
    }

    await this.installmentRepository.save(
      installments,
    );
  }

  // ==========================================
  // FIND ALL
  // ==========================================

  async findAll(userId?: string) {
    const query = this.loanRepository
      .createQueryBuilder('loan')
      .leftJoinAndSelect('loan.user', 'user')
      .leftJoinAndSelect(
        'loan.installments',
        'installments',
      );

    if (userId) {
      query.andWhere(
        'loan.user_id = :userId',
        { userId },
      );
    }

    return query
      .orderBy('loan.created_at', 'DESC')
      .getMany();
  }

  // ==========================================
  // FIND ONE
  // ==========================================

  async findOne(id: string) {
    const loan = await this.loanRepository.findOne({
      where: {
        loan_id: id,
      },
      relations: {
        installments: true,
      },
    });

    if (!loan) {
      throw new NotFoundException(
        'Loan not found.',
      );
    }

    return loan;
  }

  // ==========================================
  // UPDATE
  // ==========================================

  async update(
    id: string,
    dto: UpdateLoanDto,
  ) {
    const loan = await this.findOne(id);

    if (loan.status !== LoanStatus.ACTIVE) {
      throw new BadRequestException(
        'Only active loans can be updated.',
      );
    }

    if (dto.installment_amount) {
      loan.installment_amount =
        dto.installment_amount;
    }

    if (dto.start_date) {
      loan.start_date =
        new Date(dto.start_date);
    }

    if (dto.reason !== undefined) {
      loan.reason = dto.reason;
    }

    return this.loanRepository.save(loan);
  }

  // ==========================================
  // SKIP INSTALLMENT
  // ==========================================

  async skipInstallment(
    dto: SkipLoanInstallmentDto,
    userId: string,
  ) {
    const installment =
      await this.installmentRepository.findOne({
        where: {
          loan_installment_id:
            dto.loan_installment_id,
        },
      });

    if (!installment) {
      throw new NotFoundException(
        'Loan installment not found.',
      );
    }

    if (
      installment.status !==
      LoanInstallmentStatus.PENDING
    ) {
      throw new BadRequestException(
        'Only pending installments can be skipped.',
      );
    }

    installment.status =
      LoanInstallmentStatus.SKIPPED;

    installment.skip_reason = dto.reason;
    installment.skipped_by_id = userId;
    installment.skipped_at = new Date();

    return this.installmentRepository.save(
      installment,
    );
  }

  // ==========================================
  // GET CURRENT PAYROLL INSTALLMENT
  // ==========================================

  async getPendingInstallment(
    userId: string,
  ) {
    return this.installmentRepository
      .createQueryBuilder('installment')
      .innerJoinAndSelect(
        'installment.loan',
        'loan',
      )
      .where('loan.user_id = :userId', {
        userId,
      })
      .andWhere(
        'loan.status = :status',
        {
          status: LoanStatus.ACTIVE,
        },
      )
      .andWhere(
        'installment.status = :installmentStatus',
        {
          installmentStatus:
            LoanInstallmentStatus.PENDING,
        },
      )
      .orderBy(
        'installment.due_date',
        'ASC',
      )
      .getOne();
  }

  // ==========================================
  // MARK INSTALLMENT PAID
  // ==========================================

  async markInstallmentPaid(
    installmentId: string,
    payrollId: string,
  ) {
    const installment =
      await this.installmentRepository.findOne({
        where: {
          loan_installment_id:
            installmentId,
        },
        relations: {
          loan: true,
        },
      });

    if (!installment) {
      throw new NotFoundException(
        'Loan installment not found.',
      );
    }

    installment.status =
      LoanInstallmentStatus.PAID;

    installment.payroll_id = payrollId;
    installment.paid_at = new Date();

    await this.installmentRepository.save(
      installment,
    );

    const loan = installment.loan;

    loan.paid_installments += 1;

    loan.remaining_amount = Math.max(
      0,
      loan.remaining_amount -
        installment.amount,
    );

    if (
      loan.remaining_amount <= 0 ||
      loan.paid_installments >=
        loan.total_installments
    ) {
      loan.status =
        LoanStatus.COMPLETED;

      loan.end_date = new Date();
    }

    await this.loanRepository.save(loan);

    return installment;
  }
}