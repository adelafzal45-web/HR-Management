import { Injectable } from '@nestjs/common';

import { WorkingDaySchedulesService } from '../working-day-schedules/working-day-schedules.service';
import { isoDayOfWeek } from '../working-day-schedules/working-day-schedules.service';
import { HolidaysService } from '../holidays/holidays.service';

export interface LeaveScope {
  departmentId?: string | null;
  designationId?: string | null;
}

/**
 * Shared working-day/holiday-aware day counter.
 *
 * Used by `LeaveRequestsService` to compute chargeable days at approval
 * time, and by the entitlement preview so HR sees the same numbers before
 * assigning a balance.
 *
 * Rules:
 *  - Weekends (per the resolved working-day schedule for the employee's
 *    department/designation) are excluded.
 *  - Public holidays (company-wide or department-specific) are excluded.
 *  - A single-day request flagged `is_half_day` charges 0.5 regardless of
 *    which day of the week it falls on (the caller is responsible for not
 *    marking a non-working day as a half-day request).
 *  - A multi-day range charges one day per working day in the range, holidays
 *    excluded; half-day only applies to single-day requests.
 */
@Injectable()
export class LeaveCalculationService {
  constructor(
    private readonly workingDaySchedules: WorkingDaySchedulesService,
    private readonly holidays: HolidaysService,
  ) {}

  async countLeaveDays(
    startDate: Date | string,
    endDate: Date | string,
    scope: LeaveScope,
    isHalfDay = false,
  ): Promise<number> {
    const start = this.stripTime(startDate);
    const end = this.stripTime(endDate);

    if (end < start) {
      return 0;
    }

    const isSingleDay = start.getTime() === end.getTime();

    if (isSingleDay && isHalfDay) {
      // A half-day still has to fall on a working, non-holiday day to count.
      const workable = await this.isChargeableDay(start, scope);
      return workable ? 0.5 : 0;
    }

    const week = await this.workingDaySchedules.resolveWeek(
      scope.departmentId ?? null,
      scope.designationId ?? null,
    );
    const holidaySet = await this.holidays.getHolidayDateSet(
      start,
      end,
      scope.departmentId ?? null,
    );

    let count = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      const isWorkingDay = week.days[isoDayOfWeek(cursor)] === true;
      const isHoliday = holidaySet.has(this.toIso(cursor));
      if (isWorkingDay && !isHoliday) {
        count += 1;
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return count;
  }

  private async isChargeableDay(date: Date, scope: LeaveScope): Promise<boolean> {
    const isWorkingDay = await this.workingDaySchedules.isWorkingDay(
      date,
      scope.departmentId ?? null,
      scope.designationId ?? null,
    );
    if (!isWorkingDay) return false;

    const holidaySet = await this.holidays.getHolidayDateSet(
      date,
      date,
      scope.departmentId ?? null,
    );
    return !holidaySet.has(this.toIso(date));
  }

  private stripTime(date: Date | string): Date {
    const d = typeof date === 'string' ? new Date(`${date}T00:00:00Z`) : date;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private toIso(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
