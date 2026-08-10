import { Injectable } from '@nestjs/common';

export interface PayrollCalculationInput {
  total_salary: number;

  basic_salary: number;
  compute_allowance: number;
  medical_allowance: number;

  weekend_work_earning: number;
  public_holiday_work_earning: number;

  commission: number;
  bonus: number;
  approved_reimbursement: number;

  unpaid_leave_deduction: number;
  unauthorized_absence_deduction: number;
  half_day_deduction: number;

  provident_fund: number;
  loan_deduction: number;
  government_tax: number;
}

export interface PayrollCalculationResult {
  gross_earnings: number;
  total_deductions: number;
  net_salary: number;
}

@Injectable()
export class PayrollCalculationService {
  calculateGrossEarnings(
    input: PayrollCalculationInput,
  ): number {
    return (
      input.basic_salary +
      input.compute_allowance +
      input.medical_allowance +
      input.weekend_work_earning +
      input.public_holiday_work_earning +
      input.commission +
      input.bonus +
      input.approved_reimbursement
    );
  }

  calculateTotalDeductions(
    input: PayrollCalculationInput,
  ): number {
    return (
      input.unpaid_leave_deduction +
      input.unauthorized_absence_deduction +
      input.half_day_deduction +
      input.provident_fund +
      input.loan_deduction +
      input.government_tax
    );
  }

  calculateNetSalary(
    grossEarnings: number,
    totalDeductions: number,
  ): number {
    return grossEarnings - totalDeductions;
  }

  calculate(
    input: PayrollCalculationInput,
  ): PayrollCalculationResult {
    const grossEarnings =
      this.calculateGrossEarnings(input);

    const totalDeductions =
      this.calculateTotalDeductions(input);

    const netSalary =
      this.calculateNetSalary(
        grossEarnings,
        totalDeductions,
      );

    return {
      gross_earnings: grossEarnings,
      total_deductions: totalDeductions,
      net_salary: netSalary,
    };
  }
}