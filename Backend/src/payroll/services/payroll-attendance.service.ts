import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';

import { Attendance } from '../../attendance/attendance.entity';

export interface PayrollAttendanceResult {
  working_days: number;
  weekend_work_days: number;
  public_holiday_work_days: number;
  unauthorized_absence_days: number;
  half_days: number;

  weekend_work_earning: number;
  public_holiday_work_earning: number;
}

@Injectable()
export class PayrollAttendanceService {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
  ) {}

  async getAttendanceData(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
    dailyBasicSalary: number,
  ): Promise<PayrollAttendanceResult> {
    const attendanceRecords = await this.attendanceRepository.find({
      where: {
        user: {
          user_id: userId,
        },
        attendance_date: Between(periodStart, periodEnd),
      },
    });

    let workingDays = 0;
    let weekendWorkDays = 0;
    let publicHolidayWorkDays = 0;
    let unauthorizedAbsenceDays = 0;
    let halfDays = 0;

    for (const attendance of attendanceRecords) {
      const status = attendance.attendance_status?.toUpperCase();

      switch (status) {
        case 'PRESENT':
          workingDays++;
          break;

        case 'ABSENT':
        case 'UNAUTHORIZED_ABSENCE':
          unauthorizedAbsenceDays++;
          break;

        case 'HALF_DAY':
          workingDays += 0.5;
          halfDays++;
          break;

        case 'WEEKEND':
        case 'WEEKEND_WORK':
          weekendWorkDays++;
          break;

        case 'PUBLIC_HOLIDAY':
        case 'PUBLIC_HOLIDAY_WORK':
          publicHolidayWorkDays++;
          break;

        default:
          break;
      }
    }

    const weekendWorkEarning =
      weekendWorkDays * dailyBasicSalary * 3;

    const publicHolidayWorkEarning =
      publicHolidayWorkDays * dailyBasicSalary * 3;

    return {
      working_days: workingDays,
      weekend_work_days: weekendWorkDays,
      public_holiday_work_days: publicHolidayWorkDays,
      unauthorized_absence_days: unauthorizedAbsenceDays,
      half_days: halfDays,
      weekend_work_earning: weekendWorkEarning,
      public_holiday_work_earning: publicHolidayWorkEarning,
    };
  }
}