import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';

import { User } from '../users/user.entity';
import { Attendance } from '../attendance/attendance.entity';
import { LeaveRequest } from '../leave-requests/leave-requests.entity';
import { PerformanceReview } from '../performance-review/performance-review.entity';
import { Payslip } from '../payslips/payslips.entity';
import { PayrollSettings } from '../payroll-settings/payroll-settings.entity';
import { STATUSES_REQUIRING_CHECK_IN } from '../attendance/attendance-status';
import { HALF_DAY_DURATIONS } from '../leave-requests/leave-requests.entity';
import { WorkingDaySchedulesService } from '../working-day-schedules/working-day-schedules.service';
import { HolidaysService } from '../holidays/holidays.service';
import { AppraisalFacadeService } from '../appraisal-facade/appraisal-facade.service';

import type {
  AdminDashboardResponse,
  MonthToDateStats,
  SelfAppraisalStats,
  SelfDashboardResponse,
  SelfPayrollSummary,
  TeamDashboardResponse,
  TeamMemberStat,
  WorkingDayAttendance,
} from './dashboard.types';

/**
 * Attendance statuses that mean the employee was at work. Widened to `string[]`
 * because the stored column is a plain `varchar(20)` — comparisons here are
 * against whatever the database actually holds, not the narrowed union.
 */
const PRESENT_STATUSES: string[] = [...STATUSES_REQUIRING_CHECK_IN];

/** Appraisal statuses that carry a real score. 'Completed' is legacy. */
const SCORED_REVIEW_STATUSES = ['Submitted', 'Approved', 'Completed'];

/** How many calendar days back the "last 7 working days" walk may scan. */
const WORKING_DAY_SCAN_LIMIT = 90;

/** Working days wanted in the self-attendance table. */
const RECENT_WORKING_DAYS = 7;

/**
 * Read-only aggregates for the three role dashboards.
 *
 * Why this exists at all: until now every dashboard tile computed its own number
 * client-side from list endpoints. That works for HR/Admin, who hold every read
 * permission, but it cannot work for an Employee — "Working Days (Till Today)"
 * needs the working-day schedule (`working-days.view`, which Employee does not
 * hold) and the holiday calendar resolved together, and an Employee must never
 * be handed a roster-wide attendance list just to count their own days. So the
 * arithmetic moves server-side, where the caller's identity bounds it.
 *
 * Three scopes, three guarantees:
 *  - `admin` reads the whole org and is gated on `employees.view`.
 *  - `team` is bounded by `AppraisalFacadeService.resolveVisibleEmployeeIds`,
 *    the single authority for a lead's roster — a lead with no assignment sees
 *    an empty team, never a fallback to "everyone".
 *  - `me` takes its subject from the verified JWT only and carries no
 *    permission, exactly like `/attendance/me` and `/payslips/me`.
 *
 * Nothing here writes.
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRepository: Repository<LeaveRequest>,
    @InjectRepository(PerformanceReview)
    private readonly reviewRepository: Repository<PerformanceReview>,
    @InjectRepository(Payslip)
    private readonly payslipRepository: Repository<Payslip>,
    @InjectRepository(PayrollSettings)
    private readonly settingsRepository: Repository<PayrollSettings>,
    private readonly workingDays: WorkingDaySchedulesService,
    private readonly holidays: HolidaysService,
    private readonly appraisals: AppraisalFacadeService,
  ) {}

  // ---------------------------------------------------------------- admin ----

  /**
   * Org-wide counters for the HR/Admin dashboard.
   *
   * `absent_today` and `present_today` are counts of attendance rows actually
   * marked today — not `total − present`, which would report the whole company
   * absent before anyone has marked attendance. `on_leave_today` comes from
   * approved leave requests spanning today rather than from attendance, because
   * a leave is approved days in advance and the attendance row may not exist
   * yet.
   */
  async getAdminDashboard(): Promise<AdminDashboardResponse> {
    const today = isoDate(new Date());

    const [
      totalEmployees,
      presentToday,
      absentToday,
      onLeaveToday,
      pendingLeaveRequests,
      pendingAppraisals,
    ] = await Promise.all([
      this.usersRepository.count({ where: { status: true } }),
      this.attendanceRepository.count({
        where: {
          attendance_date: today as unknown as Date,
          attendance_status: In(PRESENT_STATUSES),
        },
      }),
      this.attendanceRepository.count({
        where: {
          attendance_date: today as unknown as Date,
          attendance_status: 'Absent',
        },
      }),
      this.countEmployeesOnLeave(today),
      this.leaveRepository.count({ where: { status: 'Pending' } }),
      // Same definition the Appraisal Stats screen uses for `pendingForms`:
      // a review that exists but has not been submitted yet.
      this.reviewRepository.count({ where: { status: 'Draft' } }),
    ]);

    return {
      as_of: today,
      total_employees: totalEmployees,
      present_today: presentToday,
      absent_today: absentToday,
      on_leave_today: onLeaveToday,
      pending_leave_requests: pendingLeaveRequests,
      pending_appraisals: pendingAppraisals,
    };
  }

  /** Distinct employees whose approved leave spans the given date. */
  private async countEmployeesOnLeave(date: string): Promise<number> {
    const rows = await this.leaveRepository
      .createQueryBuilder('leave')
      .leftJoin('leave.user', 'emp')
      .select('COUNT(DISTINCT emp.user_id)', 'count')
      .where('leave.status = :approved', { approved: 'Approved' })
      .andWhere('leave.start_date <= :date', { date })
      .andWhere('leave.end_date >= :date', { date })
      .getRawOne<{ count: string }>();

    return Number(rows?.count ?? 0);
  }

  // ----------------------------------------------------------------- self ----

  /**
   * Everything the Employee (and a Team Lead's own half of their dashboard)
   * needs, in one round trip: month-to-date attendance against the real working
   * calendar, appraisal scores, latest net pay, and the last 7 working days.
   */
  async getSelfDashboard(userId: string): Promise<SelfDashboardResponse> {
    const user = await this.usersRepository.findOne({
      where: { user_id: userId },
      relations: { department: true, designation: true },
    });

    const departmentId = user?.department?.department_id ?? null;
    const designationId = user?.designation?.designation_id ?? null;

    const today = new Date();
    const monthStart = startOfMonth(today);

    const [attendance, appraisal, payroll, lastWorkingDays] = await Promise.all([
      this.buildMonthToDate(userId, monthStart, today, departmentId, designationId),
      this.buildSelfAppraisal(userId, monthStart, today),
      this.buildSelfPayroll(userId),
      this.buildRecentWorkingDays(userId, today, departmentId, designationId),
    ]);

    return { appraisal, attendance, payroll, last_working_days: lastWorkingDays };
  }

  /**
   * Month-to-date attendance for one employee, measured against the working
   * calendar that actually applies to them (designation → department → global
   * ladder, minus holidays).
   */
  private async buildMonthToDate(
    userId: string,
    from: Date,
    to: Date,
    departmentId: string | null,
    designationId: string | null,
  ): Promise<MonthToDateStats> {
    const fromIso = isoDate(from);
    const toIso = isoDate(to);

    const [workingDays, rows, leaveDays] = await Promise.all([
      this.countWorkingDays(from, to, departmentId, designationId),
      // Raw select rather than `find`: Attendance eager-loads `user`, and the
      // only column this needs is the status.
      this.attendanceRepository
        .createQueryBuilder('attendance')
        .leftJoin('attendance.user', 'emp')
        .select('attendance.attendance_status', 'attendance_status')
        .where('emp.user_id = :userId', { userId })
        .andWhere('attendance.attendance_date BETWEEN :from AND :to', {
          from: fromIso,
          to: toIso,
        })
        .getRawMany<{ attendance_status: string }>(),
      this.countLeaveDays(userId, from, to, departmentId, designationId),
    ]);

    let present = 0;
    let absent = 0;
    let late = 0;
    for (const row of rows) {
      const status = row.attendance_status;
      if (PRESENT_STATUSES.includes(status)) present += 1;
      if (status === 'Absent') absent += 1;
      if (status === 'Late') late += 1;
    }

    return {
      month: toIso.slice(0, 7),
      from: fromIso,
      to: toIso,
      working_days: workingDays,
      present_days: present,
      absent_days: absent,
      leave_days: leaveDays,
      late_days: late,
    };
  }

  /**
   * Today's appraisal score and this month's average.
   *
   * Only submitted/approved reviews count — a Draft has no agreed score, so
   * including it would show the employee a number their lead has not stood
   * behind yet.
   */
  private async buildSelfAppraisal(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<SelfAppraisalStats> {
    const reviews = await this.reviewRepository.find({
      where: {
        reviewee: { user_id: userId },
        status: In(SCORED_REVIEW_STATUSES),
        review_date: Between(
          isoDate(from) as unknown as Date,
          isoDate(to) as unknown as Date,
        ),
      },
      select: {
        review_id: true,
        review_date: true,
        total_score_percentage: true,
      },
      order: { review_date: 'DESC' },
    });

    const todayIso = isoDate(to);
    const scores = reviews.map((r) => Number(r.total_score_percentage ?? 0));
    const todayReview = reviews.find(
      (r) => isoDate(r.review_date) === todayIso,
    );

    return {
      today_score: todayReview
        ? round2(Number(todayReview.total_score_percentage ?? 0))
        : null,
      monthly_average: scores.length ? round2(mean(scores)) : null,
      scored_this_month: scores.length,
    };
  }

  /**
   * The employee's most recent payslip, newest period first.
   *
   * Respects the same `employee_self_service` switch as `GET /payslips/me`: if
   * HR has turned self-service off, the dashboard must not become a side door
   * around it. `visible: false` tells the UI to say so instead of showing 0.
   */
  private async buildSelfPayroll(userId: string): Promise<SelfPayrollSummary> {
    const settings = await this.settingsRepository.findOne({ where: { id: 1 } });
    const currency = settings?.currency ?? 'PKR';

    if (settings && !settings.employee_self_service) {
      return {
        visible: false,
        net_salary: null,
        currency,
        period_name: null,
        period_status: null,
        pay_date: null,
      };
    }

    const payslip = await this.payslipRepository.findOne({
      where: { user_id: userId },
      relations: { period: true },
      order: { created_at: 'DESC' },
    });

    if (!payslip) {
      return {
        visible: true,
        net_salary: null,
        currency,
        period_name: null,
        period_status: null,
        pay_date: null,
      };
    }

    return {
      visible: true,
      net_salary: round2(Number(payslip.net_salary ?? 0)),
      currency,
      period_name: payslip.period?.name ?? null,
      period_status: payslip.period?.status ?? null,
      pay_date: payslip.period?.pay_date
        ? isoDate(payslip.period.pay_date)
        : null,
    };
  }

  /**
   * The last N *working* days ending today, each with whatever attendance was
   * recorded against it.
   *
   * Walking the calendar backwards (rather than taking the last 7 attendance
   * rows) is what makes a missing day visible: a working day with no row comes
   * back with `status: null`, which is exactly the gap an employee needs to see.
   * Weekends and holidays never occupy one of the seven slots.
   */
  private async buildRecentWorkingDays(
    userId: string,
    today: Date,
    departmentId: string | null,
    designationId: string | null,
  ): Promise<WorkingDayAttendance[]> {
    const dates = await this.collectRecentWorkingDates(
      today,
      departmentId,
      designationId,
    );
    if (dates.length === 0) return [];

    const rows = await this.attendanceRepository.find({
      where: {
        user: { user_id: userId },
        attendance_date: In(dates as unknown as Date[]),
      },
    });

    const byDate = new Map<string, Attendance>();
    for (const row of rows) byDate.set(isoDate(row.attendance_date), row);

    return dates.map((date) => {
      const row = byDate.get(date);
      return {
        date,
        status: row?.attendance_status ?? null,
        check_in: row?.check_in ?? null,
        check_out: row?.check_out ?? null,
        working_hours:
          row?.working_hours === null || row?.working_hours === undefined
            ? null
            : Number(row.working_hours),
      };
    });
  }

  /** Most recent working dates first, holidays excluded. */
  private async collectRecentWorkingDates(
    today: Date,
    departmentId: string | null,
    designationId: string | null,
  ): Promise<string[]> {
    const earliest = new Date(today);
    earliest.setDate(earliest.getDate() - WORKING_DAY_SCAN_LIMIT);
    const holidaySet = await this.holidays.getHolidayDateSet(
      earliest,
      today,
      departmentId,
    );

    const dates: string[] = [];
    const cursor = new Date(today);
    for (
      let scanned = 0;
      scanned < WORKING_DAY_SCAN_LIMIT && dates.length < RECENT_WORKING_DAYS;
      scanned += 1, cursor.setDate(cursor.getDate() - 1)
    ) {
      const iso = isoDate(cursor);
      if (holidaySet.has(iso)) continue;
      const isWorking = await this.workingDays.isWorkingDay(
        new Date(cursor),
        departmentId,
        designationId,
      );
      if (isWorking) dates.push(iso);
    }

    return dates;
  }

  // ----------------------------------------------------------------- team ----

  /**
   * The lead's own roster with this month's attendance and appraisal figures
   * per member.
   *
   * Scope comes from `resolveTeamRoster`, so this endpoint can never widen a
   * lead's view beyond the team they are actually assigned.
   */
  async getTeamDashboard(leadId: string): Promise<TeamDashboardResponse> {
    const today = new Date();
    const monthStart = startOfMonth(today);
    const month = isoDate(today).slice(0, 7);

    const memberIds = await this.resolveTeamRoster(leadId);

    if (memberIds.length === 0) {
      return {
        month,
        team_size: 0,
        team_performance_mean: null,
        expected_appraisals: 0,
        pending_appraisals: 0,
        members: [],
      };
    }

    const [members, attendanceRows, reviews, onLeaveIds] = await Promise.all([
      this.usersRepository.find({
        where: { user_id: In(memberIds) },
        relations: { designation: true, department: true },
        order: { first_name: 'ASC' },
      }),
      this.attendanceRepository
        .createQueryBuilder('attendance')
        .leftJoin('attendance.user', 'emp')
        .select('emp.user_id', 'user_id')
        .addSelect('attendance.attendance_date', 'attendance_date')
        .addSelect('attendance.attendance_status', 'attendance_status')
        .where('emp.user_id IN (:...memberIds)', { memberIds })
        .andWhere('attendance.attendance_date BETWEEN :from AND :to', {
          from: isoDate(monthStart),
          to: isoDate(today),
        })
        .getRawMany<{
          user_id: string;
          attendance_date: string | Date;
          attendance_status: string;
        }>(),
      this.reviewRepository
        .createQueryBuilder('review')
        .leftJoin('review.reviewee', 'emp')
        .select('emp.user_id', 'user_id')
        .addSelect('review.total_score_percentage', 'score')
        .where('emp.user_id IN (:...memberIds)', { memberIds })
        .andWhere('review.status IN (:...statuses)', {
          statuses: SCORED_REVIEW_STATUSES,
        })
        .andWhere('review.review_date BETWEEN :from AND :to', {
          from: isoDate(monthStart),
          to: isoDate(today),
        })
        .getRawMany<{ user_id: string; score: string | number }>(),
      this.listEmployeesOnLeave(memberIds, isoDate(today)),
    ]);

    const todayIso = isoDate(today);

    // Present days and today's status, per member.
    const presentDays = new Map<string, number>();
    const todayStatus = new Map<string, string>();
    for (const row of attendanceRows) {
      const date = isoDate(row.attendance_date);
      if (PRESENT_STATUSES.includes(row.attendance_status)) {
        presentDays.set(row.user_id, (presentDays.get(row.user_id) ?? 0) + 1);
      }
      if (date === todayIso) todayStatus.set(row.user_id, row.attendance_status);
    }

    // Scores, per member, plus the flat list behind the team mean.
    const memberScores = new Map<string, number[]>();
    const allScores: number[] = [];
    for (const row of reviews) {
      const score = Number(row.score ?? 0);
      const bucket = memberScores.get(row.user_id) ?? [];
      bucket.push(score);
      memberScores.set(row.user_id, bucket);
      allScores.push(score);
    }

    // Working days are per scope, not per person, so resolve each distinct
    // (department, designation) pair once rather than per member.
    const workingDayCache = new Map<string, number>();
    const rows: TeamMemberStat[] = [];

    for (const member of members) {
      const departmentId = member.department?.department_id ?? null;
      const designationId = member.designation?.designation_id ?? null;
      const cacheKey = `${departmentId ?? '-'}::${designationId ?? '-'}`;
      let workingDays = workingDayCache.get(cacheKey);
      if (workingDays === undefined) {
        workingDays = await this.countWorkingDays(
          monthStart,
          today,
          departmentId,
          designationId,
        );
        workingDayCache.set(cacheKey, workingDays);
      }

      const scores = memberScores.get(member.user_id) ?? [];

      rows.push({
        user_id: member.user_id,
        employee_code: member.employee_code ?? '—',
        employee_name: [member.first_name, member.last_name]
          .filter(Boolean)
          .join(' ')
          .trim(),
        designation: member.designation?.title ?? null,
        avatar_url: member.profile_image ?? null,
        avatar_thumb_url: member.profile_image_thumb ?? null,
        present_days: presentDays.get(member.user_id) ?? 0,
        working_days: workingDays,
        performance: scores.length ? round2(mean(scores)) : null,
        on_leave_today: onLeaveIds.has(member.user_id),
        today_status: todayStatus.get(member.user_id) ?? null,
      });
    }

    // One appraisal is expected per member per month; a member with no
    // submitted/approved review this month is still owed one.
    const pending = rows.filter((row) => row.performance === null).length;

    return {
      month,
      team_size: members.length,
      team_performance_mean: allScores.length ? round2(mean(allScores)) : null,
      expected_appraisals: members.length,
      pending_appraisals: pending,
      members: rows,
    };
  }

  /**
   * Who counts as this lead's team, from the union of the two places the system
   * actually records that relationship:
   *
   *  1. `users.team_lead_id` — the HR-maintained reporting line, and the same
   *     source `GET /users/me/team` reads. This is the one HR fills in on the
   *     employee form, so for most tenants it is the only one populated.
   *  2. `AppraisalFacadeService.resolveVisibleEmployeeIds` — explicit appraisal
   *     assignments (named members, or a whole department).
   *
   * Both are narrow by construction, so the union is still bounded: a lead with
   * neither a reporting line nor an appraisal assignment gets an empty team,
   * never a fallback to the whole organisation. Reading only (2) would leave the
   * team card blank for every tenant that assigns leads on the employee record
   * instead of through the appraisal module.
   *
   * The lead is always removed from their own roster.
   */
  private async resolveTeamRoster(leadId: string): Promise<string[]> {
    const [reports, assigned] = await Promise.all([
      this.usersRepository.find({
        where: { team_lead_id: leadId, status: true },
        select: { user_id: true },
      }),
      this.appraisals.resolveVisibleEmployeeIds(leadId),
    ]);

    const roster = new Set<string>(assigned);
    for (const report of reports) roster.add(report.user_id);
    roster.delete(leadId);

    return [...roster];
  }

  /** Which of the given employees are on approved leave on `date`. */
  private async listEmployeesOnLeave(
    memberIds: string[],
    date: string,
  ): Promise<Set<string>> {
    if (memberIds.length === 0) return new Set();

    const rows = await this.leaveRepository
      .createQueryBuilder('leave')
      .leftJoin('leave.user', 'emp')
      .select('DISTINCT emp.user_id', 'user_id')
      .where('emp.user_id IN (:...memberIds)', { memberIds })
      .andWhere('leave.status = :approved', { approved: 'Approved' })
      .andWhere('leave.start_date <= :date', { date })
      .andWhere('leave.end_date >= :date', { date })
      .getRawMany<{ user_id: string }>();

    return new Set(rows.map((row) => row.user_id));
  }

  // ---------------------------------------------------------------- shared ---

  /**
   * Scheduled working days in [from, to], holidays excluded.
   *
   * The appraisal stats service walks the calendar the same way but does not
   * subtract holidays; here it does, because a tile labelled "Working Days (Till
   * Today)" sitting next to "Presents" has to be a denominator the employee can
   * reconcile — counting Eid as a day they failed to attend is worse than
   * useless.
   */
  private async countWorkingDays(
    from: Date,
    to: Date,
    departmentId: string | null,
    designationId: string | null,
  ): Promise<number> {
    if (to < from) return 0;

    const holidaySet = await this.holidays.getHolidayDateSet(
      from,
      to,
      departmentId,
    );

    const MAX_DAYS = 400;
    let count = 0;
    let scanned = 0;
    for (
      const cursor = new Date(from);
      cursor <= to && scanned < MAX_DAYS;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      scanned += 1;
      if (holidaySet.has(isoDate(cursor))) continue;
      const isWorking = await this.workingDays.isWorkingDay(
        new Date(cursor),
        departmentId,
        designationId,
      );
      if (isWorking) count += 1;
    }

    return count;
  }

  /**
   * Approved leave days for one employee inside [from, to], counted only on
   * days they were actually scheduled to work.
   *
   * Derived from leave requests rather than attendance because a leave is
   * approved ahead of time and may have no attendance row at all. Half-day
   * durations count as 0.5, matching how leave balances are debited.
   */
  private async countLeaveDays(
    userId: string,
    from: Date,
    to: Date,
    departmentId: string | null,
    designationId: string | null,
  ): Promise<number> {
    const fromIso = isoDate(from);
    const toIso = isoDate(to);

    const leaves = await this.leaveRepository
      .createQueryBuilder('leave')
      .leftJoin('leave.user', 'emp')
      .where('emp.user_id = :userId', { userId })
      .andWhere('leave.status = :approved', { approved: 'Approved' })
      .andWhere('leave.start_date <= :to', { to: toIso })
      .andWhere('leave.end_date >= :from', { from: fromIso })
      .getMany();

    if (leaves.length === 0) return 0;

    const holidaySet = await this.holidays.getHolidayDateSet(
      from,
      to,
      departmentId,
    );

    // A single date can be covered by at most one approved leave, but overlapping
    // records exist in older data — a Map keyed on the date keeps the count
    // honest by taking the larger fraction rather than adding them together.
    const perDate = new Map<string, number>();

    for (const leave of leaves) {
      const halfDay = HALF_DAY_DURATIONS.has(leave.duration_type);
      const fraction = halfDay ? 0.5 : 1;
      const start = maxDate(new Date(`${isoDate(leave.start_date)}T00:00:00`), from);
      const end = minDate(new Date(`${isoDate(leave.end_date)}T00:00:00`), to);

      let scanned = 0;
      for (
        const cursor = new Date(start);
        cursor <= end && scanned < 400;
        cursor.setDate(cursor.getDate() + 1)
      ) {
        scanned += 1;
        const iso = isoDate(cursor);
        if (holidaySet.has(iso)) continue;
        const isWorking = await this.workingDays.isWorkingDay(
          new Date(cursor),
          departmentId,
          designationId,
        );
        if (!isWorking) continue;
        perDate.set(iso, Math.max(perDate.get(iso) ?? 0, fraction));
      }
    }

    let total = 0;
    for (const value of perDate.values()) total += value;
    return round2(total);
  }
}

// -------------------------------------------------------------- helpers -----

/** Local-calendar `YYYY-MM-DD`, never UTC-shifted. */
function isoDate(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function maxDate(a: Date, b: Date): Date {
  return a >= b ? a : b;
}

function minDate(a: Date, b: Date): Date {
  return a <= b ? a : b;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
