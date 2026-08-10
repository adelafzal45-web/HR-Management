import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Payroll } from './payroll.entity';
import { PayrollItem } from './payroll-item.entity';
import { PayrollAdjustment } from './payroll-adjustment.entity';

import { User } from '../users/user.entity';

import {
  PayrollAttendanceService,
} from './services/payroll-attendance.service';

import {
  PayrollLeaveService,
} from './services/payroll-leave.service';

import {
  PayrollLoanService,
} from './services/payroll-loan.service';

import {
  PayrollReimbursementService,
} from './services/payroll-reimbursement.service';

import {
  PayrollTaxService,
  TaxSlab,
} from './services/payroll-tax.service';

import {
  PayrollCalculationService,
} from './services/payroll-calculation.service';

import {
  PayrollAuditService,
} from './services/payroll-audit.service';

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(Payroll)
    private readonly payrollRepository:
      Repository<Payroll>,

    @InjectRepository(PayrollItem)
    private readonly payrollItemRepository:
      Repository<PayrollItem>,

    @InjectRepository(PayrollAdjustment)
    private readonly payrollAdjustmentRepository:
      Repository<PayrollAdjustment>,

    @InjectRepository(User)
    private readonly userRepository:
      Repository<User>,

    private readonly attendanceService:
      PayrollAttendanceService,

    private readonly leaveService:
      PayrollLeaveService,

    private readonly loanService:
      PayrollLoanService,

    private readonly reimbursementService:
      PayrollReimbursementService,

    private readonly taxService:
      PayrollTaxService,

    private readonly calculationService:
      PayrollCalculationService,

    private readonly auditService:
      PayrollAuditService,
  ) {}

  // ============================================================
  // GET EMPLOYEE
  // ============================================================

  private async getEmployee(
    userId: string,
  ): Promise<User> {
    const employee =
      await this.userRepository.findOne({
        where: {
          user_id: userId,
        },
      });

    if (!employee) {
      throw new NotFoundException(
        'Employee not found.',
      );
    }

    return employee;
  }

  // ============================================================
  // CREATE PAYROLL
  // ============================================================

  async createPayroll(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
    actorId: string,
  ): Promise<Payroll> {
    const employee =
      await this.getEmployee(userId);

    // ----------------------------------------------------------
    // Prevent duplicate payroll
    // ----------------------------------------------------------

    const existing =
      await this.payrollRepository.findOne({
        where: {
          user_id: userId,
          period_start: periodStart,
          period_end: periodEnd,
        },
      });

    if (existing) {
      throw new BadRequestException(
        'Payroll already exists for this employee and period.',
      );
    }

    // ----------------------------------------------------------
    // Salary snapshot
    // ----------------------------------------------------------

    const totalSalary =
      employee.salary ?? 0;

    if (totalSalary <= 0) {
      throw new BadRequestException(
        'Employee salary must be greater than zero.',
      );
    }

    const basicSalary =
      totalSalary * 0.75;

    const computeAllowance =
      totalSalary * 0.15;

    const medicalAllowance =
      totalSalary * 0.10;

    const dailyBasicSalary =
      basicSalary / 30;

    // ----------------------------------------------------------
    // Attendance
    // ----------------------------------------------------------

    const attendance =
      await this.attendanceService.getAttendanceData(
        userId,
        periodStart,
        periodEnd,
        dailyBasicSalary,
      );

    // ----------------------------------------------------------
    // Leave
    // ----------------------------------------------------------

    const leave =
      await this.leaveService.getLeaveData(
        userId,
        periodStart,
        periodEnd,
        dailyBasicSalary,
      );

    // ----------------------------------------------------------
    // Loan
    // ----------------------------------------------------------

    const loan =
      await this.loanService.getLoanData(
        userId,
        periodEnd,
      );

    // ----------------------------------------------------------
    // Reimbursement
    // ----------------------------------------------------------

    const reimbursement =
      await this.reimbursementService.getReimbursementData(
        userId,
        periodStart,
        periodEnd,
      );

    // ----------------------------------------------------------
    // Deductions based on attendance
    // ----------------------------------------------------------

    const unauthorizedAbsenceDeduction =
      attendance.unauthorized_absence_days *
      dailyBasicSalary;

    const halfDayDeduction =
      attendance.half_days *
      dailyBasicSalary *
      0.5;

    // ----------------------------------------------------------
    // Provident fund = 2% basic salary
    // ----------------------------------------------------------

    const providentFund =
      basicSalary * 0.02;

    // ----------------------------------------------------------
    // Initial earnings
    // ----------------------------------------------------------

    const commission = 0;
    const bonus = 0;

    const calculationInput = {
      total_salary: totalSalary,

      basic_salary: basicSalary,
      compute_allowance: computeAllowance,
      medical_allowance: medicalAllowance,

      weekend_work_earning:
        attendance.weekend_work_earning,

      public_holiday_work_earning:
        attendance.public_holiday_work_earning,

      commission,
      bonus,

      approved_reimbursement:
        reimbursement.approved_reimbursement,

      unpaid_leave_deduction:
        leave.unpaid_leave_deduction,

      unauthorized_absence_deduction:
        unauthorizedAbsenceDeduction,

      half_day_deduction:
        halfDayDeduction,

      provident_fund: providentFund,

      loan_deduction:
        loan.loan_deduction,

      government_tax: 0,
    };

    // ----------------------------------------------------------
    // Calculate gross before tax
    // ----------------------------------------------------------

    const preliminary =
      this.calculationService.calculate(
        calculationInput,
      );

    // ----------------------------------------------------------
    // Tax
    //
    // Tax slabs should eventually come from your
    // configuration/database.
    // ----------------------------------------------------------

    const taxSlabs: TaxSlab[] = [];

    const tax =
      this.taxService.calculate(
        preliminary.gross_earnings,
        medicalAllowance,
        reimbursement.approved_reimbursement,
        taxSlabs,
      );

    // ----------------------------------------------------------
    // Final calculation including tax
    // ----------------------------------------------------------

    calculationInput.government_tax =
      tax.government_tax;

    const finalCalculation =
      this.calculationService.calculate(
        calculationInput,
      );

    // ----------------------------------------------------------
    // Create payroll
    // ----------------------------------------------------------

    const payroll =
      this.payrollRepository.create({
        user_id: userId,

        period_start: periodStart,
        period_end: periodEnd,

        salary_days: 30,

        status: 'DRAFT',

        total_salary: totalSalary,

        basic_salary: basicSalary,

        compute_allowance:
          computeAllowance,

        medical_allowance:
          medicalAllowance,

        working_days:
          attendance.working_days,

        paid_weekend_days: 8,

        unpaid_leave_days:
          leave.unpaid_leave_days,

        unauthorized_absence_days:
          attendance.unauthorized_absence_days,

        half_days:
          attendance.half_days,

        weekend_work_days:
          attendance.weekend_work_days,

        public_holiday_work_days:
          attendance.public_holiday_work_days,

        weekend_work_earning:
          attendance.weekend_work_earning,

        public_holiday_work_earning:
          attendance.public_holiday_work_earning,

        commission,

        bonus,

        approved_reimbursement:
          reimbursement.approved_reimbursement,

        unpaid_leave_deduction:
          leave.unpaid_leave_deduction,

        unauthorized_absence_deduction:
          unauthorizedAbsenceDeduction,

        half_day_deduction:
          halfDayDeduction,

        provident_fund:
          providentFund,

        loan_deduction:
          loan.loan_deduction,

        government_tax:
          tax.government_tax,

        taxable_income:
          tax.taxable_income,

        gross_earnings:
          finalCalculation.gross_earnings,

        total_deductions:
          finalCalculation.total_deductions,

        net_salary:
          finalCalculation.net_salary,

        daily_basic_salary:
          dailyBasicSalary,
      });

    const savedPayroll =
      await this.payrollRepository.save(
        payroll,
      );

    // ----------------------------------------------------------
    // Audit
    // ----------------------------------------------------------

    await this.auditService.create({
      payroll_id:
        savedPayroll.payroll_id,

      actor_id: actorId,

      action: 'PAYROLL_CREATED',

      new_value: {
        status: 'DRAFT',
        total_salary: totalSalary,
        gross_earnings:
          finalCalculation.gross_earnings,
        total_deductions:
          finalCalculation.total_deductions,
        net_salary:
          finalCalculation.net_salary,
      },
    });

    return savedPayroll;
  }

  // ============================================================
  // FIND ONE
  // ============================================================

  async findOne(
    payrollId: string,
  ): Promise<Payroll> {
    const payroll =
      await this.payrollRepository.findOne({
        where: {
          payroll_id: payrollId,
        },
        relations: {
          items: true,
          adjustments: true,
        },
      });

    if (!payroll) {
      throw new NotFoundException(
        'Payroll not found.',
      );
    }

    return payroll;
  }

  // ============================================================
  // FIND EMPLOYEE PAYROLLS
  // ============================================================

  async findByEmployee(
    userId: string,
  ): Promise<Payroll[]> {
    return this.payrollRepository.find({
      where: {
        user_id: userId,
      },
      order: {
        period_start: 'DESC',
      },
    });
  }

  // ============================================================
  // PROCESS PAYROLL
  // ============================================================

  async processPayroll(
    payrollId: string,
    actorId: string,
  ): Promise<Payroll> {
    const payroll =
      await this.findOne(payrollId);

    if (payroll.status !== 'DRAFT') {
      throw new BadRequestException(
        'Only draft payroll can be processed.',
      );
    }

    const oldStatus =
      payroll.status;

    payroll.status = 'PROCESSING';

    await this.payrollRepository.save(
      payroll,
    );

    await this.auditService.create({
      payroll_id: payroll.payroll_id,
      actor_id: actorId,
      action: 'PAYROLL_PROCESSED',
      field_name: 'status',
      old_value: {
        status: oldStatus,
      },
      new_value: {
        status: 'PROCESSING',
      },
    });

    payroll.status = 'PROCESSED';
    payroll.generated_at = new Date();

    return this.payrollRepository.save(
      payroll,
    );
  }

  // ============================================================
  // APPROVE PAYROLL
  // ============================================================

  async approvePayroll(
    payrollId: string,
    actorId: string,
  ): Promise<Payroll> {
    const payroll =
      await this.findOne(payrollId);

    if (payroll.status !== 'PROCESSED') {
      throw new BadRequestException(
        'Only processed payroll can be approved.',
      );
    }

    payroll.status = 'APPROVED';
    payroll.approved_at = new Date();
    payroll.approved_by_id = actorId;

    const saved =
      await this.payrollRepository.save(
        payroll,
      );

    await this.auditService.create({
      payroll_id: payroll.payroll_id,
      actor_id: actorId,
      action: 'PAYROLL_APPROVED',
      field_name: 'status',
      old_value: {
        status: 'PROCESSED',
      },
      new_value: {
        status: 'APPROVED',
      },
    });

    return saved;
  }

  // ============================================================
  // LOCK PAYROLL
  // ============================================================

  async lockPayroll(
    payrollId: string,
    actorId: string,
  ): Promise<Payroll> {
    const payroll =
      await this.findOne(payrollId);

    if (payroll.status !== 'APPROVED') {
      throw new BadRequestException(
        'Only approved payroll can be locked.',
      );
    }

    payroll.status = 'LOCKED';
    payroll.locked_at = new Date();
    payroll.locked_by_id = actorId;

    const saved =
      await this.payrollRepository.save(
        payroll,
      );

    await this.auditService.create({
      payroll_id: payroll.payroll_id,
      actor_id: actorId,
      action: 'PAYROLL_LOCKED',
      field_name: 'status',
      old_value: {
        status: 'APPROVED',
      },
      new_value: {
        status: 'LOCKED',
      },
    });

    return saved;
  }

  // ============================================================
  // CANCEL PAYROLL
  // ============================================================

  async cancelPayroll(
    payrollId: string,
    actorId: string,
    reason: string,
  ): Promise<Payroll> {
    const payroll =
      await this.findOne(payrollId);

    if (payroll.status === 'LOCKED') {
      throw new BadRequestException(
        'Locked payroll cannot be cancelled.',
      );
    }

    const oldStatus =
      payroll.status;

    payroll.status = 'CANCELLED';

    const saved =
      await this.payrollRepository.save(
        payroll,
      );

    await this.auditService.create({
      payroll_id: payroll.payroll_id,
      actor_id: actorId,
      action: 'PAYROLL_CANCELLED',
      field_name: 'status',
      old_value: {
        status: oldStatus,
      },
      new_value: {
        status: 'CANCELLED',
      },
      reason,
    });

    return saved;
  }

  // ============================================================
  // ADD PAYROLL ADJUSTMENT
  // ============================================================

  async addAdjustment(
    payrollId: string,
    actorId: string,
    adjustmentType: string,
    amount: number,
    isTaxable: boolean,
    reason: string,
  ): Promise<PayrollAdjustment> {
    const payroll =
      await this.findOne(payrollId);

    if (
      payroll.status === 'LOCKED' ||
      payroll.status === 'CANCELLED'
    ) {
      throw new BadRequestException(
        'Cannot modify locked or cancelled payroll.',
      );
    }

    if (amount <= 0) {
      throw new BadRequestException(
        'Adjustment amount must be greater than zero.',
      );
    }

    const adjustment =
      this.payrollAdjustmentRepository.create({
        payroll_id: payroll.payroll_id,
        adjustment_type: adjustmentType,
        amount,
        is_taxable: isTaxable,
        reason,
        created_by_id: actorId,
      });

    const saved =
      await this.payrollAdjustmentRepository.save(
        adjustment,
      );

    await this.auditService.create({
      payroll_id: payroll.payroll_id,
      actor_id: actorId,
      action: 'ADJUSTMENT_ADDED',
      new_value: {
        adjustment_type: adjustmentType,
        amount,
        is_taxable: isTaxable,
        reason,
      },
      reason,
    });

    return saved;
  }

  // ============================================================
  // GET AUDIT LOG
  // ============================================================

  async getAuditLogs(
    payrollId: string,
  ) {
    await this.findOne(payrollId);

    return this.auditService.findByPayroll(
      payrollId,
    );
  }
}