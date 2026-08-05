import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Attendance } from './attendance.entity';
import { User } from '../users/user.entity';

import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

import { PerformanceReviewService } from '../performance-review/performance-review.service';
import {
  WorkingDaySchedulesService,
  isoDayOfWeek,
} from '../working-day-schedules/working-day-schedules.service';

/** Status used for days the company does not operate. */
export const NON_WORKING_STATUS = 'Non-Working';

/** Attendance record decorated with working-day context for reports/calendars. */
export type AttendanceWithWorkingDay = Attendance & {
  is_working_day: boolean;
  counts_as_absent: boolean;
};

/**
 * Everything the check-in / check-out buttons need in order to render without
 * guessing.
 *
 * The frontend previously derived all of this from `GET /attendance` — the whole
 * table — and decided the status itself with a hardcoded 09:15 cutoff. That both
 * leaked every employee's attendance to anyone who could read the list and
 * disagreed with the employee's actual shift.
 */
export type TodayAttendanceStatus = {
  date: string;
  is_working_day: boolean;
  can_check_in: boolean;
  can_check_out: boolean;
  attendance: Attendance | null;
  shift: {
    shift_id: string;
    shift_name: string;
    start_time: string;
    end_time: string;
    grace_period_minutes: number;
  } | null;
};

/**
 * Hours beyond this are overtime. The shift's own span would be the better
 * basis, but `break_duration_minutes` makes that a payroll question rather than
 * an arithmetic one, so this stays an explicit, single constant.
 */
const STANDARD_WORK_HOURS = 8;

/** Minutes in a day — used to unwrap a shift that crosses midnight. */
const MINUTES_PER_DAY = 1440;

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @Inject(forwardRef(() => PerformanceReviewService))
    private readonly performanceReviewService: PerformanceReviewService,

    private readonly workingDaySchedules: WorkingDaySchedulesService,
  ) {}

  // ==========================================
  // CREATE ATTENDANCE
  // ==========================================

  async create(
    createAttendanceDto: CreateAttendanceDto,
    userId: string,
  ): Promise<Attendance> {
    const user = await this.userRepository.findOne({
      where: {
        user_id: userId,
      },
      relations: ['department', 'designation', 'shift'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isWorkingDay = await this.isWorkingDayForUser(
      user,
      createAttendanceDto.attendance_date,
    );

    let status = createAttendanceDto.attendance_status;

    if (!isWorkingDay) {
      if (status.toUpperCase() === 'ABSENT') {
        throw new BadRequestException(
          `${this.formatDate(createAttendanceDto.attendance_date)} is not a working day for this employee, so it cannot be recorded as Absent.`,
        );
      }

      if (!createAttendanceDto.check_in) {
        status = NON_WORKING_STATUS;
      }
    }
    const attendanceDate = this.formatDate(createAttendanceDto.attendance_date);

    const existingAttendance = await this.attendanceRepository
      .createQueryBuilder('attendance')
      .leftJoin('attendance.user', 'user')
      .where('user.user_id = :userId', { userId })
      .andWhere('attendance.attendance_date = :date', {
        date: attendanceDate,
      })
      .getOne();

    if (existingAttendance) {
      throw new BadRequestException('You have already checked in today.');
    }
    const attendance = this.attendanceRepository.create({
      attendance_date: createAttendanceDto.attendance_date,
      check_in: createAttendanceDto.check_in,
      check_out: createAttendanceDto.check_out,
      working_hours: createAttendanceDto.working_hours,
      attendance_status: status,

      // Logged-in employee
      user,

      // Shift comes from logged-in employee
      shift: user.shift,

      overtime_hours: createAttendanceDto.overtime_hours,
      is_overtime: createAttendanceDto.is_overtime ?? false,
    });

    const savedAttendance = await this.attendanceRepository.save(attendance);

    // ==========================================
    // AUTO ZERO APPRAISAL LOGIC
    // ==========================================

    if (status.toUpperCase() === 'ABSENT') {
      await this.performanceReviewService.createAbsentReview(savedAttendance);
    }

    return savedAttendance;
  }

  // ==========================================
  // SELF-SERVICE — the check-in / check-out buttons
  // ==========================================
  //
  // Every method here takes the employee id from the caller's verified JWT and
  // touches only that employee's own row for today. Nothing is trusted from the
  // client: not the clock, not the status, not the hours. That is the point —
  // the previous flow let the browser POST `/attendance` with any `user_id`,
  // any `attendance_status` and any `working_hours` it liked, and it decided
  // Late/Present itself against a hardcoded 09:15 that no shift agreed with.

  /**
   * Everything the buttons need to render: today's row (if any), whether today
   * is a working day, and which of the two actions is currently legal.
   */
  async getTodayForUser(userId: string): Promise<TodayAttendanceStatus> {
    const user = await this.loadUserForClock(userId);
    const date = this.today();

    const attendance = await this.findOwnAttendanceOn(userId, date);
    const isWorkingDay = await this.isWorkingDayForUser(user, date);

    return {
      date,
      is_working_day: isWorkingDay,
      // Check-in stays legal on a non-working day (weekend cover, callout): the
      // day simply never counts as an absence. Blocking it would leave someone
      // who genuinely worked with no way to record it.
      can_check_in: !attendance?.check_in,
      can_check_out: !!attendance?.check_in && !attendance?.check_out,
      attendance: attendance ?? null,
      shift: user.shift
        ? {
            shift_id: user.shift.shift_id,
            shift_name: user.shift.shift_name,
            start_time: user.shift.start_time,
            end_time: user.shift.end_time,
            grace_period_minutes: user.shift.grace_period_minutes ?? 0,
          }
        : null,
    };
  }

  /** Stamps the caller in, on the server's clock, against their own shift. */
  async checkIn(userId: string): Promise<AttendanceWithWorkingDay> {
    const user = await this.loadUserForClock(userId);
    const date = this.today();
    const now = this.currentTime();

    const existing = await this.findOwnAttendanceOn(userId, date);

    if (existing?.check_in) {
      throw new ConflictException(
        `You already checked in today at ${existing.check_in.slice(0, 5)}.`,
      );
    }

    const status = this.resolveArrivalStatus(user, now);

    // A row can already exist without a check-in — an absence sweep or an HR
    // correction creates one. Stamping that row is right; a second row for the
    // same day would double-count in every report and trip the date/user pair.
    const attendance =
      existing ??
      this.attendanceRepository.create({
        attendance_date: date as unknown as Date,
        user,
        attendance_status: status,
      });

    attendance.check_in = now;
    attendance.attendance_status = status;
    // Keep whatever shift the row was created with (HR may have corrected it);
    // otherwise take the employee's assigned shift rather than guessing from
    // their most recent attendance row, which is what the frontend used to do.
    attendance.shift = attendance.shift ?? user.shift ?? undefined;

    const saved = await this.attendanceRepository.save(attendance);
    const [decorated] = await this.decorateWithWorkingDay([saved]);
    return decorated;
  }

  /**
   * Stamps the caller out and derives the hours from the two stamps.
   *
   * Working and overtime hours are computed here rather than accepted from the
   * client because a client-supplied figure is a client-chosen figure — and
   * these feed payroll.
   */
  async checkOut(userId: string): Promise<AttendanceWithWorkingDay> {
    const date = this.today();
    const attendance = await this.findOwnAttendanceOn(userId, date);

    if (!attendance?.check_in) {
      throw new BadRequestException(
        'You have not checked in today, so there is nothing to check out of.',
      );
    }

    if (attendance.check_out) {
      throw new ConflictException(
        `You already checked out today at ${attendance.check_out.slice(0, 5)}.`,
      );
    }

    const now = this.currentTime();
    const { workingHours, overtimeHours } = this.deriveHours(
      attendance.check_in,
      now,
      attendance.shift?.break_duration_minutes ?? 0,
    );

    attendance.check_out = now;
    attendance.working_hours = workingHours;
    attendance.overtime_hours = overtimeHours;
    attendance.is_overtime = overtimeHours > 0;

    const saved = await this.attendanceRepository.save(attendance);
    const [decorated] = await this.decorateWithWorkingDay([saved]);
    return decorated;
  }

  /**
   * The caller's own attendance for one month.
   *
   * Exists so the history table does not have to fetch `GET /attendance` — the
   * whole organisation's attendance — and narrow it in the browser.
   */
  async getMyHistory(
    userId: string,
    month: number,
    year: number,
  ): Promise<AttendanceWithWorkingDay[]> {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException(
        'month must be an integer between 1 and 12.',
      );
    }

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException(
        'year must be an integer between 2000 and 2100.',
      );
    }

    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    // Day 0 of the next month is the last day of this one, which handles
    // February and leap years without a table of month lengths.
    const to = this.formatDate(new Date(Date.UTC(year, month, 0)));

    const records = await this.attendanceRepository
      .createQueryBuilder('attendance')
      .leftJoinAndSelect('attendance.user', 'user')
      .leftJoinAndSelect('user.department', 'department')
      .leftJoinAndSelect('user.designation', 'designation')
      .leftJoinAndSelect('attendance.shift', 'shift')
      .where('user.user_id = :userId', { userId })
      .andWhere('attendance.attendance_date BETWEEN :from AND :to', {
        from,
        to,
      })
      .orderBy('attendance.attendance_date', 'DESC')
      .getMany();

    return this.decorateWithWorkingDay(records);
  }

  /**
   * Late is the shift's business, not the browser's: `start_time` plus the grace
   * period the shift itself defines. With no assigned shift there is no lateness
   * to measure, so the day is simply Present.
   */
  private resolveArrivalStatus(user: User, arrivedAt: string): string {
    if (!user.shift) return 'Present';

    const cutoff =
      this.minutesOf(user.shift.start_time) +
      (user.shift.grace_period_minutes ?? 0);

    return this.minutesOf(arrivedAt) > cutoff ? 'Late' : 'Present';
  }

  /** Loads the employee with the relations the clock needs. */
  private async loadUserForClock(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { user_id: userId },
      relations: ['department', 'designation', 'shift'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.status === false) {
      throw new BadRequestException(
        'This account is inactive and cannot record attendance.',
      );
    }

    return user;
  }

  private findOwnAttendanceOn(
    userId: string,
    date: string,
  ): Promise<Attendance | null> {
    return this.attendanceRepository.findOne({
      where: {
        user: { user_id: userId },
        attendance_date: date as unknown as Date,
      },
      relations: ['user', 'user.department', 'user.designation', 'shift'],
    });
  }

  /**
   * Hours between two "HH:mm:ss" stamps, less the shift's unpaid break.
   *
   * A check-out earlier on the clock than the check-in means the shift crossed
   * midnight, so the difference wraps by a day rather than clamping to zero —
   * the client-side helper clamped, which paid night staff for no hours at all.
   */
  private deriveHours(
    checkIn: string,
    checkOut: string,
    breakMinutes: number,
  ): { workingHours: number; overtimeHours: number } {
    let minutes = this.minutesOf(checkOut) - this.minutesOf(checkIn);
    if (minutes < 0) minutes += MINUTES_PER_DAY;

    const worked = Math.max(0, minutes - Math.max(0, breakMinutes));
    const workingHours = Math.round((worked / 60) * 100) / 100;
    const overtimeHours =
      Math.round(Math.max(0, workingHours - STANDARD_WORK_HOURS) * 100) / 100;

    return { workingHours, overtimeHours };
  }

  /** "HH:mm:ss" (or "HH:mm") to minutes since midnight. */
  private minutesOf(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
  }

  /**
   * Today, on the server's own clock.
   *
   * Built from local components rather than `toISOString()`: UTC rolls the date
   * over at the wrong moment for any server not on UTC, so an early-morning
   * check-in at UTC+5 would be filed against the previous calendar day.
   */
  private today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${this.pad(now.getMonth() + 1)}-${this.pad(now.getDate())}`;
  }

  /** Now, as the "HH:mm:ss" the `time` columns expect. */
  private currentTime(): string {
    const now = new Date();
    return `${this.pad(now.getHours())}:${this.pad(now.getMinutes())}:${this.pad(now.getSeconds())}`;
  }

  private pad(value: number): string {
    return String(value).padStart(2, '0');
  }

  // ==========================================
  // FIND ALL
  // ==========================================

  async findAll(): Promise<AttendanceWithWorkingDay[]> {
    const records = await this.attendanceRepository.find({
      relations: [
        'user',
        'user.department',
        'user.designation',
        'shift',
        'performanceReviews',
      ],

      order: {
        attendance_date: 'DESC',
      },
    });

    return this.decorateWithWorkingDay(records);
  }

  // ==========================================
  // FIND ONE
  // ==========================================

  async findOne(id: string): Promise<AttendanceWithWorkingDay> {
    const attendance = await this.attendanceRepository.findOne({
      where: {
        attendance_id: id,
      },

      relations: [
        'user',
        'user.department',
        'user.designation',
        'shift',
        'performanceReviews',
      ],
    });
    if (!attendance) {
      throw new NotFoundException('Attendance record not found');
    }

    const [decorated] = await this.decorateWithWorkingDay([attendance]);
    return decorated;
  }

  // ==========================================
  // UPDATE (CHECK-OUT)
  // ==========================================

  async update(
    userId: string,
    updateAttendanceDto: UpdateAttendanceDto,
  ): Promise<Attendance> {
    const attendanceDate = updateAttendanceDto.attendance_date
      ? new Date(updateAttendanceDto.attendance_date)
      : new Date();

    attendanceDate.setHours(0, 0, 0, 0);

    // Find today's attendance of logged-in user
    const attendance = await this.attendanceRepository.findOne({
      where: {
        user: {
          user_id: userId,
        },
        attendance_date: attendanceDate,
      },
      relations: [
        'user',
        'user.department',
        'user.designation',
        'shift',
        'performanceReviews',
      ],
    });

    if (!attendance) {
      throw new NotFoundException('No check-in found for today.');
    }

    const targetStatus =
      updateAttendanceDto.attendance_status ?? attendance.attendance_status;

    // ==========================================
    // Validate Absent only on working day
    // ==========================================

    if (
      targetStatus.toUpperCase() === 'ABSENT' &&
      !(await this.isWorkingDayForUser(
        attendance.user,
        attendance.attendance_date,
      ))
    ) {
      throw new BadRequestException(
        `${this.formatDate(
          attendance.attendance_date,
        )} is not a working day for this employee.`,
      );
    }

    // ==========================================
    // Check-In cannot be updated
    // ==========================================

    if (attendance.check_in && updateAttendanceDto.check_in) {
      throw new BadRequestException(
        'Check-in has already been recorded and cannot be updated.',
      );
    }

    // ==========================================
    // Check-Out cannot be updated twice
    // ==========================================

    if (attendance.check_out && updateAttendanceDto.check_out) {
      throw new BadRequestException(
        'Check-out has already been recorded and cannot be updated.',
      );
    }

    // ==========================================
    // Allow only first check-out
    // ==========================================

    if (!attendance.check_out && updateAttendanceDto.check_out) {
      attendance.check_out = updateAttendanceDto.check_out;
    }

    attendance.working_hours =
      updateAttendanceDto.working_hours ?? attendance.working_hours;

    attendance.attendance_status = targetStatus;

    attendance.overtime_hours =
      updateAttendanceDto.overtime_hours ?? attendance.overtime_hours;

    attendance.is_overtime =
      updateAttendanceDto.is_overtime ?? attendance.is_overtime;

    const updatedAttendance = await this.attendanceRepository.save(attendance);

    // ==========================================
    // Auto Zero Appraisal
    // ==========================================

    if (updatedAttendance.attendance_status.toUpperCase() === 'ABSENT') {
      await this.performanceReviewService.createAbsentReview(updatedAttendance);
    }

    return updatedAttendance;
  }
  // ==========================================
  // DELETE
  // ==========================================

  async remove(id: string) {
    const attendance = await this.findOne(id);

    await this.attendanceRepository.remove(attendance);

    return {
      message: 'Attendance deleted successfully',
    };
  }

  // ==========================================
  // WORKING DAY SUPPORT
  // ==========================================

  /**
   * Working-day flags for a date range, for calendars and reports.
   *
   * Returns one entry per calendar day so the frontend can shade non-working
   * days without having to reimplement the fallback ladder. `counts_as_absent`
   * is what absence rates should be divided by: a day the company was closed is
   * neither present nor absent, it is simply out of scope.
   */
  async getWorkingDayCalendar(
    from: string,
    to: string,
    departmentId?: string | null,
    designationId?: string | null,
  ): Promise<
    Array<{ date: string; day_of_week: number; is_working: boolean }>
  > {
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException(
        'from and to must be valid dates in YYYY-MM-DD format.',
      );
    }

    if (start > end) {
      throw new BadRequestException('from must not be after to.');
    }

    const MAX_DAYS = 366;
    const spanDays =
      Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

    if (spanDays > MAX_DAYS) {
      throw new BadRequestException(
        `Range too large: ${spanDays} days requested, maximum is ${MAX_DAYS}.`,
      );
    }

    // Resolved once for the whole range rather than per day.
    const week = await this.workingDaySchedules.resolveWeek(
      departmentId,
      designationId,
    );

    const out: Array<{
      date: string;
      day_of_week: number;
      is_working: boolean;
    }> = [];

    for (
      const cursor = new Date(start);
      cursor <= end;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const dow = isoDayOfWeek(cursor.toISOString().slice(0, 10));
      out.push({
        date: cursor.toISOString().slice(0, 10),
        day_of_week: dow,
        is_working: week.days[dow] === true,
      });
    }

    return out;
  }

  /**
   * Tags each record with whether its date was a working day for that employee.
   *
   * Weeks are resolved once per distinct department/designation pair, so a large
   * result set costs a handful of queries rather than one per row.
   */
  private async decorateWithWorkingDay(
    records: Attendance[],
  ): Promise<AttendanceWithWorkingDay[]> {
    const weekCache = new Map<string, Record<number, boolean>>();

    const out: AttendanceWithWorkingDay[] = [];

    for (const record of records) {
      const departmentId = record.user?.department?.department_id ?? null;
      const designationId = record.user?.designation?.designation_id ?? null;
      const cacheKey = `${departmentId ?? '-'}|${designationId ?? '-'}`;

      let week = weekCache.get(cacheKey);
      if (!week) {
        week = (
          await this.workingDaySchedules.resolveWeek(
            departmentId,
            designationId,
          )
        ).days;
        weekCache.set(cacheKey, week);
      }

      const isWorkingDay =
        week[isoDayOfWeek(this.formatDate(record.attendance_date))] === true;

      out.push(
        Object.assign(record, {
          is_working_day: isWorkingDay,
          counts_as_absent:
            isWorkingDay && record.attendance_status.toUpperCase() === 'ABSENT',
        }) as AttendanceWithWorkingDay,
      );
    }

    return out;
  }

  private async isWorkingDayForUser(
    user: User,
    date: Date | string,
  ): Promise<boolean> {
    return this.workingDaySchedules.isWorkingDay(
      this.formatDate(date),
      user.department?.department_id ?? null,
      user.designation?.designation_id ?? null,
    );
  }

  /** Normalises a date column (Date or 'YYYY-MM-DD' string) to 'YYYY-MM-DD'. */
  private formatDate(date: Date | string): string {
    if (typeof date === 'string') return date.slice(0, 10);
    return date.toISOString().slice(0, 10);
  }
}
