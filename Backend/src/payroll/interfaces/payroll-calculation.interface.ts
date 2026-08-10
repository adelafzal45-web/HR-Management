import { PayrollBreakdown } from './payroll-breakdown.interface';

export interface PayrollCalculation {
  employeeId: number;

  payrollMonth: number;
  payrollYear: number;

  basicSalary: number;

  grossSalary: number;

  totalAllowances: number;

  totalDeductions: number;

  taxAmount: number;

  loanDeduction: number;

  reimbursementAmount: number;

  netSalary: number;

  breakdown: PayrollBreakdown;
}