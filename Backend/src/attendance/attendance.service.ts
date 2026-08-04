import {
  Injectable,
  NotFoundException,
  BadRequestException,
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

  async create(createAttendanceDto: CreateAttendanceDto): Promise<Attendance> {
    const user = await this.userRepository.findOne({
      where: {
        user_id: createAttendanceDto.user_id,
      },
      relations: ['department', 'designation'],
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
      // A non-working day cannot produce an absence. Recording one would
      // inflate absence counts and, via createAbsentReview below, punish the
      // employee's appraisal for a day the company was closed.
      if (status.toUpperCase() === 'ABSENT') {
        throw new BadRequestException(
          `${this.formatDate(createAttendanceDto.attendance_date)} is not a working day for this employee, so it cannot be recorded as Absent.`,
        );
      }

      // Attendance on a non-working day is legitimate (overtime, weekend
      // cover). It is recorded, just never as an absence.
      if (!createAttendanceDto.check_in) {
        status = NON_WORKING_STATUS;
      }
    }

    const attendance = this.attendanceRepository.create({
      attendance_date: createAttendanceDto.attendance_date,

      check_in: createAttendanceDto.check_in,

      check_out: createAttendanceDto.check_out,

      working_hours: createAttendanceDto.working_hours,

      attendance_status: status,

      user,
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
  // FIND ALL
  // ==========================================

  async findAll(): Promise<AttendanceWithWorkingDay[]> {
    const records = await this.attendanceRepository.find({
      relations: ['user', 'user.department', 'user.designation', 'shift', 'performanceReviews'],

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

      relations: ['user', 'user.department', 'user.designation', 'shift', 'performanceReviews'],
    });

    if (!attendance) {
      throw new NotFoundException('Attendance record not found');
    }

    const [decorated] = await this.decorateWithWorkingDay([attendance]);
    return decorated;
  }

  // ==========================================
  // UPDATE
  // ==========================================

  async update(
    id: string,
    updateAttendanceDto: UpdateAttendanceDto,
  ): Promise<Attendance> {
    const attendance = await this.findOne(id);

    if (updateAttendanceDto.user_id) {
      const user = await this.userRepository.findOne({
        where: {
          user_id: updateAttendanceDto.user_id,
        },
        relations: ['department', 'designation'],
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      attendance.user = user;
    }

    const targetDate =
      updateAttendanceDto.attendance_date ?? attendance.attendance_date;
    const targetStatus =
      updateAttendanceDto.attendance_status ?? attendance.attendance_status;

    // Same rule as create: an absence can only exist on a working day. Checked
    // against the merged result, so moving a record onto a weekend or flipping
    // its status to Absent are both caught.
    if (
      targetStatus.toUpperCase() === 'ABSENT' &&
      !(await this.isWorkingDayForUser(attendance.user, targetDate))
    ) {
      throw new BadRequestException(
        `${this.formatDate(targetDate)} is not a working day for this employee, so it cannot be recorded as Absent.`,
      );
    }

    Object.assign(attendance, {
      attendance_date: targetDate,

      check_in: updateAttendanceDto.check_in ?? attendance.check_in,

      check_out: updateAttendanceDto.check_out ?? attendance.check_out,

      working_hours:
        updateAttendanceDto.working_hours ?? attendance.working_hours,

      attendance_status: targetStatus,
    });

    const updatedAttendance = await this.attendanceRepository.save(attendance);

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
  ): Promise<Array<{ date: string; day_of_week: number; is_working: boolean }>> {
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

    const out: Array<{ date: string; day_of_week: number; is_working: boolean }> =
      [];

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
          await this.workingDaySchedules.resolveWeek(departmentId, designationId)
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
