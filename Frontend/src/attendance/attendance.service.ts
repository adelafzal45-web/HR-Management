import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Attendance } from './attendance.entity';
import { User } from '../users/user.entity';

import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { BulkMarkAttendanceDto } from './dto/bulk-mark-attendance.dto';

import {
  ATTENDANCE_STATUSES,
  NON_WORKING_STATUS,
  STATUSES_FORBIDDING_CHECK_IN,
  STATUSES_REQUIRING_CHECK_IN,
  type AttendanceStatus,
} from './attendance-status';

import {
  derivePunctuality,
  NO_PUNCTUALITY,
  type AttendancePunctuality,
} from './attendance-punctuality';

import { PerformanceReviewService } from '../performance-review/performance-review.service';
import {
  WorkingDaySchedulesService,
  isoDayOfWeek,
} from '../working-day-schedules/working-day-schedules.service';

// Re-exported so the existing import path keeps working; the value itself now
// lives with the rest of the status vocabulary in `attendance-status.ts`.
export { NON_WORKING_STATUS };

/** Attendance record decorated with working-day context for reports/calendars. */
export type AttendanceWithWorkingDay = Attendance &
  AttendancePunctuality & {
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
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @Inject(forwardRef(() => PerformanceReviewService))
    private readonly performanceReviewService: PerformanceReviewService,

    private readonly workingDaySchedules: WorkingDaySchedulesService,
  ) {}

  /**
   * Fires the auto-zero appraisal behind an absence, and swallows anything it
   * throws.
   *
   * The attendance row is already committed by the time this runs. An appraisal
   * that cannot be written is a problem for the appraisal module to report in
   * the log, not a reason to hand the caller a 500 for a save that succeeded —
   * that combination is what made a marked-absent request look like it had
   * failed while the record sat in the table.
   */
  private async writeAbsentReview(attendance: Attendance): Promise<void> {
    try {
      await this.performanceReviewService.createAbsentReview(attendance);
    } catch (error) {
      this.logger.error(
        `Attendance ${attendance.attendance_id} was saved as Absent but its auto-zero appraisal could not be written.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

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

    if (user.status === false) {
      throw new BadRequestException(
        'This account is inactive and cannot record attendance.',
      );
    }

    const attendanceDate = this.formatDate(createAttendanceDto.attendance_date);

    // A record dated in the future is always a mistake — attendance is a report
    // of what happened, and a future row would sit there being counted by every
    // report until the day arrives.
    if (attendanceDate > this.today()) {
      throw new BadRequestException(
        `${attendanceDate} is in the future. Attendance can only be recorded for today or a past date.`,
      );
    }

    const isWorkingDay = await this.isWorkingDayForUser(user, attendanceDate);

    let status = this.normaliseStatus(createAttendanceDto.attendance_status);

    if (!isWorkingDay) {
      if (status === 'Absent') {
        throw new BadRequestException(
          `${attendanceDate} is not a working day for this employee, so it cannot be recorded as Absent.`,
        );
      }

      if (!createAttendanceDto.check_in) {
        status = NON_WORKING_STATUS;
      }
    }

    // Every rule that relates the status, the two stamps and the hours to each
    // other lives in one place, so `create` and `update` cannot disagree about
    // what a consistent row looks like.
    const { workingHours, overtimeHours, isOvertime } = this.assertConsistent({
      status,
      checkIn: createAttendanceDto.check_in,
      checkOut: createAttendanceDto.check_out,
      workingHours: createAttendanceDto.working_hours,
      overtimeHours: createAttendanceDto.overtime_hours,
      isOvertime: createAttendanceDto.is_overtime,
      breakMinutes: user.shift?.break_duration_minutes ?? 0,
    });

    const existingAttendance = await this.attendanceRepository
      .createQueryBuilder('attendance')
      .leftJoin('attendance.user', 'user')
      .where('user.user_id = :userId', { userId })
      .andWhere('attendance.attendance_date = :date', {
        date: attendanceDate,
      })
      .getOne();

    if (existingAttendance) {
      throw new BadRequestException(
        `Attendance for ${attendanceDate} already exists. Update the existing record instead of creating a second one.`,
      );
    }

    const attendance = this.attendanceRepository.create({
      attendance_date: createAttendanceDto.attendance_date,
      check_in: createAttendanceDto.check_in,
      check_out: createAttendanceDto.check_out,
      working_hours: workingHours,
      attendance_status: status,

      // Logged-in employee
      user,

      // Shift comes from logged-in employee
      shift: user.shift,

      overtime_hours: overtimeHours,
      is_overtime: isOvertime,
    });

    const savedAttendance = await this.attendanceRepository.save(attendance);

    // ==========================================
    // AUTO ZERO APPRAISAL LOGIC
    // ==========================================

    if (status === 'Absent') {
      await this.writeAbsentReview(savedAttendance);
    }

    return savedAttendance;
  }

  // ==========================================
  // CONSISTENCY RULES
  // ==========================================

  /**
   * Maps an incoming status onto the canonical spelling, rejecting anything
   * outside the vocabulary.
   *
   * The DTO's `@IsIn` already covers the HTTP path; this covers everything that
   * reaches the service by another route (the scheduler, seeds, tests) and
   * makes the comparisons below exact-match rather than `.toUpperCase()`
   * guesswork.
   */
  private normaliseStatus(value: string): AttendanceStatus {
    const match = ATTENDANCE_STATUSES.find(
      (status) => status.toLowerCase() === value.trim().toLowerCase(),
    );

    if (!match) {
      throw new BadRequestException(
        `attendance_status must be one of: ${ATTENDANCE_STATUSES.join(', ')}.`,
      );
    }

    return match;
  }

  /**
   * The cross-field rules a single attendance row has to satisfy, and the hours
   * that follow from them.
   *
   * None of this was checked before: `create` and `update` both took
   * `working_hours`, `overtime_hours` and `is_overtime` straight off the DTO,
   * so a caller could file an Absent day with a check-in, a check-out before
   * its check-in, and nine hours of overtime — all of which flow into payroll
   * figures and, for Absent, into an auto-generated zero appraisal.
   *
   * Hours are recomputed rather than trusted whenever both stamps are present.
   * A supplied figure is only accepted for a stamp-less correction, and even
   * then it has to agree with `is_overtime`.
   */
  private assertConsistent(input: {
    status: AttendanceStatus;
    checkIn?: string;
    checkOut?: string;
    workingHours?: number;
    overtimeHours?: number;
    isOvertime?: boolean;
    breakMinutes: number;
  }): {
    workingHours?: number;
    overtimeHours?: number;
    isOvertime: boolean;
  } {
    const { status, checkIn, checkOut } = input;

    if (!checkIn && STATUSES_REQUIRING_CHECK_IN.includes(status)) {
      throw new BadRequestException(`A ${status} day needs a check-in time.`);
    }

    if (checkIn && STATUSES_FORBIDDING_CHECK_IN.includes(status)) {
      throw new BadRequestException(
        `A ${status} day cannot have a check-in time. Record it as Present, Late or Half-Day instead.`,
      );
    }

    if (checkOut && !checkIn) {
      throw new BadRequestException(
        'A check-out time needs a check-in time to go with it.',
      );
    }

    if (checkIn && checkOut) {
      // Equal stamps, not just reversed ones: a zero-length day is a mis-click
      // on the check-out button, and it would record a real attendance as zero
      // hours. A genuinely reversed pair is treated as a shift crossing
      // midnight by `deriveHours`, which is why it is not rejected here.
      if (this.minutesOf(checkIn) === this.minutesOf(checkOut)) {
        throw new BadRequestException(
          'Check-out cannot be the same time as check-in.',
        );
      }

      const derived = this.deriveHours(checkIn, checkOut, input.breakMinutes);

      return {
        workingHours: derived.workingHours,
        overtimeHours: derived.overtimeHours,
        isOvertime: derived.overtimeHours > 0,
      };
    }

    // No check-out, so nothing to derive from. Hours are only meaningful once
    // the day is closed; carrying a supplied figure on an open row would let it
    // survive the check-out that should have replaced it.
    if (
      !checkOut &&
      (input.workingHours != null || input.overtimeHours != null)
    ) {
      throw new BadRequestException(
        'Working and overtime hours are calculated at check-out and cannot be set before it.',
      );
    }

    if (input.isOvertime === true) {
      throw new BadRequestException(
        'Overtime is determined from the recorded hours and cannot be set directly.',
      );
    }

    return {
      workingHours: undefined,
      overtimeHours: undefined,
      isOvertime: false,
    };
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

    // An `On Leave` row is a decision someone already made about this day.
    // Stamping over it would silently turn approved leave into a normal working
    // day — including for the leave balance, which reads this column — so the
    // correction has to go through HR rather than through the button.
    if (
      existing &&
      this.normaliseStatus(existing.attendance_status) === 'On Leave'
    ) {
      throw new ConflictException(
        'Today is recorded as leave. Ask HR to cancel the leave before checking in.',
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
   *
   * The comparison is made in minutes-from-shift-start rather than
   * minutes-from-midnight, so a night shift that begins at 22:00 and an arrival
   * at 22:10 is ten minutes late rather than fourteen hours early.
   */
  private resolveArrivalStatus(user: User, arrivedAt: string): string {
    if (!user.shift) return 'Present';

    const start = this.minutesOf(user.shift.start_time);
    let offset = this.minutesOf(arrivedAt) - start;

    // Half a day either side of the start is the widest window in which an
    // arrival still plausibly belongs to this shift; beyond it, the clock has
    // wrapped and the arrival is on the other side of midnight.
    if (offset < -MINUTES_PER_DAY / 2) offset += MINUTES_PER_DAY;
    if (offset > MINUTES_PER_DAY / 2) offset -= MINUTES_PER_DAY;

    return offset > (user.shift.grace_period_minutes ?? 0) ? 'Late' : 'Present';
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

    const targetStatus = this.normaliseStatus(
      updateAttendanceDto.attendance_status ?? attendance.attendance_status,
    );

    // ==========================================
    // Validate Absent only on working day
    // ==========================================

    if (
      targetStatus === 'Absent' &&
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

    if (!attendance.check_in && updateAttendanceDto.check_in) {
      attendance.check_in = updateAttendanceDto.check_in;
    }

    // The same rules `create` applies, against the row as it will be once this
    // update lands. Previously the three numeric fields were taken straight off
    // the DTO, so this endpoint could set 99 overtime hours on an Absent day
    // that the create path would have refused outright.
    const { workingHours, overtimeHours, isOvertime } = this.assertConsistent({
      status: targetStatus,
      checkIn: attendance.check_in,
      checkOut: attendance.check_out,
      workingHours: updateAttendanceDto.working_hours,
      overtimeHours: updateAttendanceDto.overtime_hours,
      isOvertime: updateAttendanceDto.is_overtime,
      breakMinutes: attendance.shift?.break_duration_minutes ?? 0,
    });

    attendance.working_hours = workingHours;
    attendance.attendance_status = targetStatus;
    attendance.overtime_hours = overtimeHours;
    attendance.is_overtime = isOvertime;

    const updatedAttendance = await this.attendanceRepository.save(attendance);

    // ==========================================
    // Auto Zero Appraisal
    // ==========================================

    if (targetStatus === 'Absent') {
      await this.writeAbsentReview(updatedAttendance);
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
  // UPDATE BY ID — the HR correction path
  // ==========================================

  /**
   * Corrects one attendance row, addressed by its own id.
   *
   * `update` above finds the row by (caller, date), which is right for an
   * employee closing their own day and useless for HR fixing someone else's
   * Tuesday — there was no route that could do it, which is why the Attendance
   * Records screen's edit dialog had nothing to call.
   *
   * Unlike `update`, this deliberately allows an existing stamp to be replaced:
   * a correction whose whole purpose is fixing a wrong check-in cannot be
   * refused on the grounds that a check-in already exists. Every other rule —
   * status vocabulary, stamp/status coherence, derived hours — is the shared
   * `assertConsistent`, so a correction cannot produce a row that `create`
   * would have rejected.
   */
  async updateById(
    id: string,
    dto: UpdateAttendanceDto,
  ): Promise<AttendanceWithWorkingDay> {
    const attendance = await this.attendanceRepository.findOne({
      where: { attendance_id: id },
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

    const targetStatus = this.normaliseStatus(
      dto.attendance_status ?? attendance.attendance_status,
    );

    // `undefined` means "leave as-is"; `null` means "clear it". The correction
    // dialog needs the second one to turn a Present day into an Absent one.
    const nextCheckIn =
      dto.check_in === undefined
        ? attendance.check_in
        : (dto.check_in ?? undefined);
    const nextCheckOut =
      dto.check_out === undefined
        ? attendance.check_out
        : (dto.check_out ?? undefined);

    if (
      targetStatus === 'Absent' &&
      !(await this.isWorkingDayForUser(
        attendance.user,
        attendance.attendance_date,
      ))
    ) {
      throw new BadRequestException(
        `${this.formatDate(attendance.attendance_date)} is not a working day for this employee, so it cannot be recorded as Absent.`,
      );
    }

    const { workingHours, overtimeHours, isOvertime } = this.assertConsistent({
      status: targetStatus,
      checkIn: nextCheckIn,
      checkOut: nextCheckOut,
      workingHours: dto.working_hours,
      overtimeHours: dto.overtime_hours,
      isOvertime: dto.is_overtime,
      breakMinutes: attendance.shift?.break_duration_minutes ?? 0,
    });

    attendance.check_in = nextCheckIn;
    attendance.check_out = nextCheckOut;
    attendance.attendance_status = targetStatus;
    attendance.working_hours = workingHours;
    attendance.overtime_hours = overtimeHours;
    attendance.is_overtime = isOvertime;

    const saved = await this.attendanceRepository.save(attendance);

    if (targetStatus === 'Absent') {
      await this.writeAbsentReview(saved);
    }

    const [decorated] = await this.decorateWithWorkingDay([saved]);
    return decorated;
  }

  // ==========================================
  // BULK MARK — HR filing one date for many employees
  // ==========================================

  /**
   * Applies one status, on one date, to a list of employees.
   *
   * Every employee goes through `create`, so a bulk mark cannot file anything
   * the single-record path would have refused — same status vocabulary, same
   * stamp/status coherence, same future-date and duplicate guards. The point of
   * the method is the loop and the report, not a second set of rules.
   *
   * One employee failing does not abort the run. A shutdown day marked for two
   * hundred people should not be lost because three of them already have a row;
   * the caller gets a per-employee outcome and can act on the failures alone.
   */
  async bulkMark(
    dto: BulkMarkAttendanceDto,
    actorId: string,
  ): Promise<{
    marked: number;
    skipped: number;
    total: number;
    results: Array<{
      user_id: string;
      employee_code: string | null;
      employee_name: string;
      ok: boolean;
      reason?: string;
    }>;
  }> {
    const targets = await this.resolveBulkTargets(dto);

    if (targets.length === 0) {
      throw new BadRequestException(
        'No employees matched. Select at least one employee, or use all_active with a department that has active staff.',
      );
    }

    const results: Array<{
      user_id: string;
      employee_code: string | null;
      employee_name: string;
      ok: boolean;
      reason?: string;
    }> = [];

    for (const target of targets) {
      const name =
        `${target.first_name ?? ''} ${target.last_name ?? ''}`.trim() ||
        target.email ||
        target.user_id;

      try {
        await this.create(
          {
            attendance_date: dto.attendance_date as unknown as Date,
            attendance_status: dto.attendance_status,
            check_in: dto.check_in,
            check_out: dto.check_out,
          },
          target.user_id,
        );

        results.push({
          user_id: target.user_id,
          employee_code: target.employee_code ?? null,
          employee_name: name,
          ok: true,
        });
      } catch (error) {
        // The message from `create` is already the specific reason this row was
        // refused — "already exists", "not a working day", "cannot have a
        // check-in time" — so it is surfaced as-is rather than flattened.
        results.push({
          user_id: target.user_id,
          employee_code: target.employee_code ?? null,
          employee_name: name,
          ok: false,
          reason:
            error instanceof Error
              ? error.message
              : 'Could not mark this employee.',
        });
      }
    }

    const marked = results.filter((r) => r.ok).length;

    // Logged rather than returned: the actor is already known from the token,
    // and a bulk write is the one attendance action with no per-row audit trail.
    this.logger.log(
      `Bulk mark by ${actorId}: ${dto.attendance_status} on ${dto.attendance_date} — ${marked}/${results.length} marked.`,
    );

    return {
      marked,
      skipped: results.length - marked,
      total: results.length,
      results,
    };
  }

  /**
   * Turns the bulk DTO's three targeting modes into a concrete employee list.
   *
   * An explicit `user_ids` wins over `all_active`, and an empty selection is
   * never silently promoted to "everyone" — that is what `all_active` is for,
   * and it has to be asked for.
   */
  private async resolveBulkTargets(
    dto: BulkMarkAttendanceDto,
  ): Promise<User[]> {
    if (dto.user_ids?.length) {
      const users = await this.userRepository.find({
        where: { user_id: In(dto.user_ids) },
        relations: ['department', 'designation', 'shift'],
      });

      const found = new Set(users.map((u) => u.user_id));
      const missing = dto.user_ids.filter((id) => !found.has(id));

      if (missing.length) {
        throw new NotFoundException(
          `${missing.length} of the selected employees no longer exist.`,
        );
      }

      return users;
    }

    if (!dto.all_active) {
      throw new BadRequestException(
        'Select employees to mark, or set all_active to mark every active employee.',
      );
    }

    return this.userRepository.find({
      where: {
        status: true,
        ...(dto.department_id
          ? { department: { department_id: dto.department_id } }
          : {}),
      },
      relations: ['department', 'designation', 'shift'],
    });
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

      const punctuality = record.shift
        ? derivePunctuality({
            checkIn: record.check_in,
            checkOut: record.check_out,
            shiftStart: record.shift.start_time,
            shiftEnd: record.shift.end_time,
            graceMinutes: record.shift.grace_period_minutes,
          })
        : NO_PUNCTUALITY;

      out.push(
        Object.assign(record, {
          is_working_day: isWorkingDay,
          counts_as_absent:
            isWorkingDay && record.attendance_status.toUpperCase() === 'ABSENT',
          ...punctuality,
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
