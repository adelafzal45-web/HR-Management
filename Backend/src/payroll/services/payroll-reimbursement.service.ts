import { Injectable } from '@nestjs/common';

export interface PayrollReimbursementResult {
  approved_reimbursement: number;
}

export interface PayrollReimbursementProvider {
  getApprovedAmount(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number>;
}

@Injectable()
export class PayrollReimbursementService {
  private reimbursementProvider?: PayrollReimbursementProvider;

  setReimbursementProvider(
    provider: PayrollReimbursementProvider,
  ): void {
    this.reimbursementProvider = provider;
  }

  async getReimbursementData(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<PayrollReimbursementResult> {
    if (!this.reimbursementProvider) {
      return {
        approved_reimbursement: 0,
      };
    }

    const amount =
      await this.reimbursementProvider.getApprovedAmount(
        userId,
        periodStart,
        periodEnd,
      );

    return {
      approved_reimbursement: amount ?? 0,
    };
  }
}