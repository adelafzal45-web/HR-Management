import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';

import { LeaveRequest } from '../../leave-requests/leave-requests.entity';

export interface PayrollLeaveResult {
  unpaid_leave_days: number;
  unpaid_leave_deduction: number;
}

@Injectable()
export class PayrollLeaveService {
  constructor(
    @InjectRepository(LeaveRequest)
    private readonly leaveRepository: Repository<LeaveRequest>,
  ) {}

  async getLeaveData(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
    dailyBasicSalary: number,
  ): Promise<PayrollLeaveResult> {
    const leaveRequests = await this.leaveRepository.find({
      where: {
        user: {
          user_id: userId,
        },
        start_date: Between(periodStart, periodEnd),
        status: 'Approved',
      },
    });

    let unpaidLeaveDays = 0;

    for (const leave of leaveRequests) {
      const leaveType = leave.leave_type?.toLowerCase();

      if (
        leaveType === 'unpaid' ||
        leaveType === 'unpaid leave'
      ) {
        unpaidLeaveDays += leave.days_count ?? 0;
      }
    }

    const unpaidLeaveDeduction =
      unpaidLeaveDays * dailyBasicSalary;

    return {
      unpaid_leave_days: unpaidLeaveDays,
      unpaid_leave_deduction: unpaidLeaveDeduction,
    };
  }
}