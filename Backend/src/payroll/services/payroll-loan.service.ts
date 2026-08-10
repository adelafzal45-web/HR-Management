import { Injectable } from '@nestjs/common';

export interface PayrollLoanResult {
  loan_deduction: number;
}

export interface PayrollLoanProvider {
  getMonthlyDeduction(
    userId: string,
    payrollDate: Date,
  ): Promise<number>;
}

@Injectable()
export class PayrollLoanService {
  private loanProvider?: PayrollLoanProvider;

  setLoanProvider(provider: PayrollLoanProvider): void {
    this.loanProvider = provider;
  }

  async getLoanData(
    userId: string,
    payrollDate: Date,
  ): Promise<PayrollLoanResult> {
    if (!this.loanProvider) {
      return {
        loan_deduction: 0,
      };
    }

    const deduction =
      await this.loanProvider.getMonthlyDeduction(
        userId,
        payrollDate,
      );

    return {
      loan_deduction: deduction ?? 0,
    };
  }
}