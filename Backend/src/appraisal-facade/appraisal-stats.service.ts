import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import * as ExcelJS from 'exceljs';

import { User } from '../users/user.entity';
import { Attendance } from '../attendance/attendance.entity';
import { LeaveRequest } from '../leave-requests/leave-requests.entity';
import { PerformanceReview } from '../performance-review/performance-review.entity';
import { WorkingDaySchedulesService } from '../working-day-schedules/working-day-schedules.service';
import {
  paginatedResult,
  type PaginatedResult,
} from '../common/dto/pagination-query.dto';

import { AppraisalFacadeService } from './appraisal-facade.service';
import { CompareStatsQueryDto, StatsQueryDto } from './dto/stats-query.dto';

export interface StatsSummaryDto {
  workingDays: number;
  submittedForms: number;
  pendingForms: number;
  approvedForms: number;
  rejectedForms: number;
  absents: number;
  employeesOnLeave: number;
  /** Mean of every scored review in range, 0–100. */
  averageScore: number;
  /** Sum of the same scores — the spec's "Gross Score". */
  grossScore: number;
  /** Reviews counted toward the two figures above. */
  scoredCount: number;
}

export interface TrendPointDto {
  period: string;
  averageScore: number;
  count: number;
}

export interface StatusSliceDto {
  status: string;
  count: number;
}

export interface StatsResponseDto {
  summary: StatsSummaryDto;
  trend: TrendPointDto[];
  byStatus: StatusSliceDto[];
  byDepartment: Array<{ department: string; averageScore: number; count: number }>;
}

export interface ResultRowDto {
  reviewId: string;
  /*
   * Carried alongside the display code so the results table can feed the
   * compare view directly. `employeeCode` is what a human reads, but
   * `/appraisal/compare` takes uuids, and without this the frontend would have
   * to re-resolve every selected row through a second lookup.
   */
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  designation: string;
  evaluationType: string;
  reviewPeriod: string;
  grossScore: number;
  status: string;
  reviewerName: string;
  submittedAt: string | null;
}

export interface CompareEmployeeDto {
  employeeId: string;
  employeeCode: string;
  name: string;
  department: string;
  designation: string;
  grossScore: number;
  averageScore: number;
  reviewCount: number;
  submittedCount: number;
  approvedCount: number;
  presentDays: number;
  absentDays: number;
  attendanceRate: number;
  trend: TrendPointDto[];
}

export interface CompareResponseDto {
  employees: CompareEmployeeDto[];
  /** Same employees ordered by averageScore, highest first. */
  ranking: Array<{
    rank: number;
    employeeId: string;
    name: string;
    averageScore: number;
    grossScore: number;
  }>;
  periods: string[];
}

/** Statuses that mean the reviewer has finished, whatever HR did next. */
const SUBMITTED_STATUSES = ['Submitted', 'Approved', 'Rejected'];

/** Hard ceiling on an export, independent of the page size. */
const MAX_EXPORT_ROWS = 5000;

/**
 * Reporting for the appraisal vertical: stats, comparison, the results table, and
 * the Excel exports of each.
 *
 * **Scoping is enforced here, not in the controller.** Every public method takes a
 * `viewer` and narrows the query to what that viewer may see:
 *
 *  - an Employee sees only their own reviews, derived from the JWT and never from
 *    a path or query param;
 *  - a Team Lead sees only their resolved roster, via
 *    `AppraisalFacadeService.resolveVisibleEmployeeIds` — the same helper the
 *    roster and submit paths use, so all three can never disagree;
 *  - HR/Admin sees everything.
 *
 * Doing this in a guard would mean the filter lived beside the route rather than
 * beside the query, and every new endpoint would be one forgotten decorator away
 * from leaking the whole org.
 */
@Injectable()
export class AppraisalStatsService {
  constructor(
    @InjectRepository(PerformanceReview)
    private readonly reviewRepository: Repository<PerformanceReview>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,

    @InjectRepository(LeaveRequest)
    private readonly leaveRepository: Repository<LeaveRequest>,

    private readonly workingDays: WorkingDaySchedulesService,

    private readonly facade: AppraisalFacadeService,
  ) {}

  // ==========================================================================
  // Stats
  // ==========================================================================

  async getStats(
    query: StatsQueryDto,
    viewer: StatsViewer,
  ): Promise<StatsResponseDto> {
    const scope = await this.resolveScope(viewer);

    const reviews = await this.buildReviewQuery(query, scope)
      .take(MAX_EXPORT_ROWS)
      .getMany();

    const scored = reviews.filter((review) =>
      SUBMITTED_STATUSES.includes(review.status),
    );
    const scores = scored.map((review) =>
      Number(review.total_score_percentage ?? 0),
    );

    const grossScore = scores.reduce((sum, value) => sum + value, 0);

    const [workingDays, absents, employeesOnLeave] = await Promise.all([
      this.countWorkingDays(query),
      this.countAbsents(query, scope),
      this.countEmployeesOnLeave(query, scope),
    ]);

    return {
      summary: {
        workingDays,
        submittedForms: reviews.filter((r) => r.status === 'Submitted').length,
        pendingForms: reviews.filter((r) => r.status === 'Draft').length,
        approvedForms: reviews.filter((r) => r.status === 'Approved').length,
        rejectedForms: reviews.filter((r) => r.status === 'Rejected').length,
        absents,
        employeesOnLeave,
        averageScore: scores.length ? this.round2(grossScore / scores.length) : 0,
        grossScore: this.round2(grossScore),
        scoredCount: scores.length,
      },
      trend: this.buildTrend(scored),
      byStatus: this.buildStatusSlices(reviews),
      byDepartment: this.buildDepartmentSlices(scored),
    };
  }

  // ==========================================================================
  // Results table
  // ==========================================================================

  async getResults(
    query: StatsQueryDto,
    viewer: StatsViewer,
  ): Promise<PaginatedResult<ResultRowDto>> {
    const scope = await this.resolveScope(viewer);

    const qb = this.buildReviewQuery(query, scope);

    if (query.search) {
      qb.andWhere(
        `(reviewee."first_name" ILIKE :search OR reviewee."last_name" ILIKE :search OR reviewee."employee_code" ILIKE :search OR review."review_period" ILIKE :search)`,
        { search: `%${query.search}%` },
      );
    }

    this.applySort(qb, query.sortBy, query.order);

    const [rows, total] = await qb
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();

    return paginatedResult(rows.map((row) => this.toResultRow(row)), total, query);
  }

  // ==========================================================================
  // Compare
  // ==========================================================================

  async compare(
    query: CompareStatsQueryDto,
    viewer: StatsViewer,
  ): Promise<CompareResponseDto> {
    const employeeIds = [...new Set(query.employeeIds)];
    if (employeeIds.length < 2) {
      throw new BadRequestException(
        'Comparing needs at least two distinct employees.',
      );
    }

    const scope = await this.resolveScope(viewer);
    if (scope.employeeIds) {
      const outside = employeeIds.filter((id) => !scope.employeeIds!.has(id));
      if (outside.length > 0) {
        throw new BadRequestException(
          'One or more of the selected employees are outside the records you can view.',
        );
      }
    }

    const employees = await this.userRepository.find({
      where: { user_id: In(employeeIds) },
      relations: { department: true, designation: true },
    });
    if (employees.length !== employeeIds.length) {
      throw new BadRequestException('One or more employee ids do not exist.');
    }

    const periods = new Set<string>();

    const results: CompareEmployeeDto[] = [];

    for (const employee of employees) {
      const reviews = await this.buildReviewQuery(
        {
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
          evaluationType: query.evaluationType,
          employeeId: employee.user_id,
        } as StatsQueryDto,
        scope,
      )
        .take(MAX_EXPORT_ROWS)
        .getMany();

      const scored = reviews.filter((review) =>
        SUBMITTED_STATUSES.includes(review.status),
      );
      const scores = scored.map((review) =>
        Number(review.total_score_percentage ?? 0),
      );
      const gross = scores.reduce((sum, value) => sum + value, 0);

      const trend = this.buildTrend(scored);
      trend.forEach((point) => periods.add(point.period));

      const attendance = await this.countAttendanceFor(
        employee.user_id,
        query.dateFrom,
        query.dateTo,
      );

      results.push({
        employeeId: employee.user_id,
        employeeCode: employee.employee_code ?? '',
        name: `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim(),
        department: employee.department?.department_name ?? '',
        designation: employee.designation?.title ?? '',
        grossScore: this.round2(gross),
        averageScore: scores.length ? this.round2(gross / scores.length) : 0,
        reviewCount: reviews.length,
        submittedCount: reviews.filter((r) => r.status === 'Submitted').length,
        approvedCount: reviews.filter((r) => r.status === 'Approved').length,
        presentDays: attendance.present,
        absentDays: attendance.absent,
        attendanceRate: attendance.rate,
        trend,
      });
    }

    const ranking = [...results]
      .sort((a, b) => b.averageScore - a.averageScore)
      .map((employee, index) => ({
        rank: index + 1,
        employeeId: employee.employeeId,
        name: employee.name,
        averageScore: employee.averageScore,
        grossScore: employee.grossScore,
      }));

    return {
      employees: results,
      ranking,
      periods: [...periods].sort(),
    };
  }

  // ==========================================================================
  // Excel export
  // ==========================================================================

  /**
   * Streams the results table to .xlsx.
   *
   * Deliberately not the paginated shape: an export of "page 2 of 47" is a bug
   * report waiting to happen. It applies the same filters, ignores `page`/`limit`,
   * and caps at `MAX_EXPORT_ROWS` — with a note written into the sheet when the
   * cap is hit, so a truncated file can never be mistaken for a complete one.
   */
  async exportResultsToExcel(
    query: StatsQueryDto,
    viewer: StatsViewer,
  ): Promise<Buffer> {
    const scope = await this.resolveScope(viewer);

    const qb = this.buildReviewQuery(query, scope);
    this.applySort(qb, query.sortBy, query.order);

    const total = await qb.getCount();
    const rows = await qb.take(MAX_EXPORT_ROWS).getMany();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HRMS';
    const sheet = workbook.addWorksheet('Appraisal Results');

    sheet.columns = [
      { header: 'Emp. Code', key: 'employeeCode', width: 14 },
      { header: 'Name', key: 'employeeName', width: 26 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Designation', key: 'designation', width: 20 },
      { header: 'Evaluation Type', key: 'evaluationType', width: 16 },
      { header: 'Period', key: 'reviewPeriod', width: 16 },
      { header: 'Gross Score', key: 'grossScore', width: 13 },
      { header: 'Status', key: 'status', width: 13 },
      { header: 'Reviewer', key: 'reviewerName', width: 24 },
      { header: 'Submitted At', key: 'submittedAt', width: 22 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { vertical: 'middle' };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const row of rows) {
      sheet.addRow(this.toResultRow(row));
    }

    sheet.getColumn('grossScore').numFmt = '0.00';

    if (total > rows.length) {
      const note = sheet.addRow({});
      note.getCell(1).value = `Truncated: showing ${rows.length} of ${total} matching rows. Narrow the filters to export the rest.`;
      note.font = { italic: true };
    }

    const summarySheet = workbook.addWorksheet('Summary');
    const stats = await this.getStats(query, viewer);
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 28 },
      { header: 'Value', key: 'value', width: 16 },
    ];
    summarySheet.getRow(1).font = { bold: true };
    for (const [metric, value] of Object.entries(stats.summary)) {
      summarySheet.addRow({ metric: this.humanise(metric), value });
    }

    // exceljs types this as ExcelJS.Buffer (an ArrayBuffer alias) rather than a
    // Node Buffer; the controller needs the latter to pipe it to the response.
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
  }

  async exportCompareToExcel(
    query: CompareStatsQueryDto,
    viewer: StatsViewer,
  ): Promise<Buffer> {
    const comparison = await this.compare(query, viewer);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HRMS';

    const sheet = workbook.addWorksheet('Comparison');
    sheet.columns = [
      { header: 'Rank', key: 'rank', width: 8 },
      { header: 'Emp. Code', key: 'employeeCode', width: 14 },
      { header: 'Name', key: 'name', width: 26 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Designation', key: 'designation', width: 20 },
      { header: 'Gross Score', key: 'grossScore', width: 13 },
      { header: 'Average Score', key: 'averageScore', width: 14 },
      { header: 'Reviews', key: 'reviewCount', width: 10 },
      { header: 'Approved', key: 'approvedCount', width: 11 },
      { header: 'Present Days', key: 'presentDays', width: 13 },
      { header: 'Absent Days', key: 'absentDays', width: 13 },
      { header: 'Attendance %', key: 'attendanceRate', width: 14 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const rankById = new Map(
      comparison.ranking.map((entry) => [entry.employeeId, entry.rank]),
    );

    for (const employee of comparison.employees) {
      sheet.addRow({
        rank: rankById.get(employee.employeeId) ?? '',
        ...employee,
      });
    }

    // One column per period, one row per employee — the shape the trend chart
    // draws, so the spreadsheet and the PDF tell the same story.
    const trendSheet = workbook.addWorksheet('Trend');
    trendSheet.columns = [
      { header: 'Employee', key: 'name', width: 26 },
      ...comparison.periods.map((period) => ({
        header: period,
        key: period,
        width: 14,
      })),
    ];
    trendSheet.getRow(1).font = { bold: true };

    for (const employee of comparison.employees) {
      const byPeriod = new Map(
        employee.trend.map((point) => [point.period, point.averageScore]),
      );
      const row: Record<string, string | number> = { name: employee.name };
      for (const period of comparison.periods) {
        row[period] = byPeriod.get(period) ?? 0;
      }
      trendSheet.addRow(row);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
  }

  // ==========================================================================
  // Scoping
  // ==========================================================================

  private async resolveScope(viewer: StatsViewer): Promise<StatsScope> {
    if (viewer.scope === 'all') {
      return { employeeIds: null };
    }

    if (viewer.scope === 'self') {
      return { employeeIds: new Set([viewer.userId]) };
    }

    const roster = await this.facade.resolveVisibleEmployeeIds(viewer.userId);
    // A lead's own reviews are theirs to see, and excluding them would make the
    // lead's own numbers vanish from a dashboard they are looking at.
    roster.add(viewer.userId);
    return { employeeIds: roster };
  }

  // ==========================================================================
  // Query building
  // ==========================================================================

  private buildReviewQuery(
    query: StatsQueryDto,
    scope: StatsScope,
  ): SelectQueryBuilder<PerformanceReview> {
    const qb = this.reviewRepository
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.reviewee', 'reviewee')
      .leftJoinAndSelect('review.reviewer', 'reviewer')
      .leftJoinAndSelect('review.appraisalForm', 'form')
      .leftJoinAndSelect('reviewee.department', 'department')
      .leftJoinAndSelect('reviewee.designation', 'designation');

    if (scope.employeeIds) {
      if (scope.employeeIds.size === 0) {
        // An impossible predicate rather than an early return: the caller still
        // gets a well-formed empty page instead of a special case per method.
        qb.andWhere('1 = 0');
        return qb;
      }
      qb.andWhere('reviewee."user_id" IN (:...scopedIds)', {
        scopedIds: [...scope.employeeIds],
      });
    }

    if (query.dateFrom) {
      qb.andWhere('review."review_date" >= :dateFrom', {
        dateFrom: query.dateFrom,
      });
    }
    if (query.dateTo) {
      qb.andWhere('review."review_date" <= :dateTo', { dateTo: query.dateTo });
    }
    if (query.departmentId) {
      qb.andWhere('department."department_id" = :departmentId', {
        departmentId: query.departmentId,
      });
    }
    if (query.designationId) {
      qb.andWhere('designation."designation_id" = :designationId', {
        designationId: query.designationId,
      });
    }
    if (query.employeeId) {
      qb.andWhere('reviewee."user_id" = :employeeId', {
        employeeId: query.employeeId,
      });
    }
    if (query.evaluationType) {
      qb.andWhere('review."evaluation_type" = :evaluationType', {
        evaluationType: query.evaluationType,
      });
    }
    if (query.status) {
      qb.andWhere('review."status" = :status', { status: query.status });
    }

    return qb;
  }

  /**
   * Whitelisted sort columns.
   *
   * `sortBy` is a free-text query param, so it is mapped through a fixed table
   * rather than interpolated — `orderBy` takes a raw SQL fragment and would
   * happily accept whatever arrived in the URL.
   */
  private applySort(
    qb: SelectQueryBuilder<PerformanceReview>,
    sortBy: string | undefined,
    direction: 'ASC' | 'DESC',
  ): void {
    const SORTABLE: Record<string, string> = {
      employeeName: 'reviewee.first_name',
      employeeCode: 'reviewee.employee_code',
      department: 'department.department_name',
      designation: 'designation.title',
      evaluationType: 'review.evaluation_type',
      reviewPeriod: 'review.review_period',
      grossScore: 'review.total_score_percentage',
      status: 'review.status',
      submittedAt: 'review.submitted_at',
      reviewDate: 'review.review_date',
    };

    qb.orderBy(SORTABLE[sortBy ?? ''] ?? 'review.review_date', direction);
  }

  // ==========================================================================
  // Aggregates
  // ==========================================================================

  /**
   * Working days in the range, from the configured schedule.
   *
   * Walks day by day through `WorkingDaySchedulesService` rather than assuming
   * Monday–Friday: the resolver is the only thing that knows a department may
   * work Saturdays, and a hardcoded weekday count would silently disagree with
   * the auto-absent job that uses it.
   *
   * With no range given there is nothing to count, so it returns 0 rather than
   * scanning an unbounded span.
   */
  private async countWorkingDays(query: StatsQueryDto): Promise<number> {
    if (!query.dateFrom || !query.dateTo) return 0;

    const start = new Date(`${query.dateFrom}T00:00:00`);
    const end = new Date(`${query.dateTo}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    if (end < start) return 0;

    const MAX_DAYS = 400;
    let count = 0;
    let scanned = 0;

    for (
      const cursor = new Date(start);
      cursor <= end && scanned < MAX_DAYS;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      scanned += 1;
      const isWorking = await this.workingDays.isWorkingDay(
        new Date(cursor),
        query.departmentId ?? null,
        query.designationId ?? null,
      );
      if (isWorking) count += 1;
    }

    return count;
  }

  private async countAbsents(
    query: StatsQueryDto,
    scope: StatsScope,
  ): Promise<number> {
    const qb = this.attendanceRepository
      .createQueryBuilder('attendance')
      .leftJoin('attendance.user', 'emp')
      .where('attendance."attendance_status" = :status', { status: 'Absent' });

    if (scope.employeeIds) {
      if (scope.employeeIds.size === 0) return 0;
      qb.andWhere('emp."user_id" IN (:...scopedIds)', {
        scopedIds: [...scope.employeeIds],
      });
    }
    if (query.employeeId) {
      qb.andWhere('emp."user_id" = :employeeId', {
        employeeId: query.employeeId,
      });
    }
    if (query.departmentId) {
      qb.andWhere('emp."department_id" = :departmentId', {
        departmentId: query.departmentId,
      });
    }
    if (query.designationId) {
      qb.andWhere('emp."designation_id" = :designationId', {
        designationId: query.designationId,
      });
    }
    if (query.dateFrom) {
      qb.andWhere('attendance."attendance_date" >= :dateFrom', {
        dateFrom: query.dateFrom,
      });
    }
    if (query.dateTo) {
      qb.andWhere('attendance."attendance_date" <= :dateTo', {
        dateTo: query.dateTo,
      });
    }

    return qb.getCount();
  }

  /**
   * Distinct employees with approved leave overlapping the range.
   *
   * Overlap, not containment: someone on leave from before `dateFrom` until after
   * `dateTo` is on leave for the whole period and would be missed entirely by a
   * `start_date BETWEEN` test.
   */
  private async countEmployeesOnLeave(
    query: StatsQueryDto,
    scope: StatsScope,
  ): Promise<number> {
    const qb = this.leaveRepository
      .createQueryBuilder('leave')
      .leftJoin('leave.user', 'emp')
      .select('COUNT(DISTINCT emp."user_id")', 'count')
      .where('leave."status" = :status', { status: 'Approved' });

    if (scope.employeeIds) {
      if (scope.employeeIds.size === 0) return 0;
      qb.andWhere('emp."user_id" IN (:...scopedIds)', {
        scopedIds: [...scope.employeeIds],
      });
    }
    if (query.employeeId) {
      qb.andWhere('emp."user_id" = :employeeId', {
        employeeId: query.employeeId,
      });
    }
    if (query.departmentId) {
      qb.andWhere('emp."department_id" = :departmentId', {
        departmentId: query.departmentId,
      });
    }
    if (query.dateFrom) {
      qb.andWhere('leave."end_date" >= :dateFrom', { dateFrom: query.dateFrom });
    }
    if (query.dateTo) {
      qb.andWhere('leave."start_date" <= :dateTo', { dateTo: query.dateTo });
    }

    const raw = await qb.getRawOne<{ count: string }>();
    return Number(raw?.count ?? 0);
  }

  private async countAttendanceFor(
    employeeId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<{ present: number; absent: number; rate: number }> {
    const base = () => {
      const qb = this.attendanceRepository
        .createQueryBuilder('attendance')
        .leftJoin('attendance.user', 'emp')
        .where('emp."user_id" = :employeeId', { employeeId });
      if (dateFrom) {
        qb.andWhere('attendance."attendance_date" >= :dateFrom', { dateFrom });
      }
      if (dateTo) {
        qb.andWhere('attendance."attendance_date" <= :dateTo', { dateTo });
      }
      return qb;
    };

    const [present, absent] = await Promise.all([
      base()
        .andWhere('attendance."attendance_status" != :absent', {
          absent: 'Absent',
        })
        .getCount(),
      base()
        .andWhere('attendance."attendance_status" = :absent', {
          absent: 'Absent',
        })
        .getCount(),
    ]);

    const total = present + absent;
    return {
      present,
      absent,
      rate: total > 0 ? this.round2((present / total) * 100) : 0,
    };
  }

  // ==========================================================================
  // Shaping
  // ==========================================================================

  private buildTrend(reviews: PerformanceReview[]): TrendPointDto[] {
    const byPeriod = new Map<string, { total: number; count: number }>();

    for (const review of reviews) {
      const key = review.review_period;
      const bucket = byPeriod.get(key) ?? { total: 0, count: 0 };
      bucket.total += Number(review.total_score_percentage ?? 0);
      bucket.count += 1;
      byPeriod.set(key, bucket);
    }

    return [...byPeriod.entries()]
      .map(([period, bucket]) => ({
        period,
        averageScore: this.round2(bucket.total / bucket.count),
        count: bucket.count,
      }))
      // Lexical sort is correct for every period key the scheduler emits —
      // '2026-08-03', '2026-W32', '2026-08' all sort chronologically as strings.
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  private buildStatusSlices(reviews: PerformanceReview[]): StatusSliceDto[] {
    const counts = new Map<string, number>();
    for (const review of reviews) {
      counts.set(review.status, (counts.get(review.status) ?? 0) + 1);
    }
    return ['Draft', 'Submitted', 'Approved', 'Rejected']
      .map((status) => ({ status, count: counts.get(status) ?? 0 }))
      .filter((slice) => slice.count > 0);
  }

  private buildDepartmentSlices(
    reviews: PerformanceReview[],
  ): Array<{ department: string; averageScore: number; count: number }> {
    const byDept = new Map<string, { total: number; count: number }>();

    for (const review of reviews) {
      const name = review.reviewee?.department?.department_name ?? 'Unassigned';
      const bucket = byDept.get(name) ?? { total: 0, count: 0 };
      bucket.total += Number(review.total_score_percentage ?? 0);
      bucket.count += 1;
      byDept.set(name, bucket);
    }

    return [...byDept.entries()]
      .map(([department, bucket]) => ({
        department,
        averageScore: this.round2(bucket.total / bucket.count),
        count: bucket.count,
      }))
      .sort((a, b) => b.averageScore - a.averageScore);
  }

  private toResultRow(review: PerformanceReview): ResultRowDto {
    return {
      reviewId: review.review_id,
      employeeId: review.reviewee?.user_id ?? '',
      employeeCode: review.reviewee?.employee_code ?? '',
      employeeName: `${review.reviewee?.first_name ?? ''} ${
        review.reviewee?.last_name ?? ''
      }`.trim(),
      department: review.reviewee?.department?.department_name ?? '',
      designation: review.reviewee?.designation?.title ?? '',
      evaluationType: review.evaluation_type,
      reviewPeriod: review.review_period,
      grossScore: this.round2(Number(review.total_score_percentage ?? 0)),
      status: review.status,
      reviewerName: `${review.reviewer?.first_name ?? ''} ${
        review.reviewer?.last_name ?? ''
      }`.trim(),
      submittedAt: review.submitted_at
        ? new Date(review.submitted_at).toISOString()
        : null,
    };
  }

  private humanise(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (char) => char.toUpperCase())
      .trim();
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}

/** Who is asking, and how wide their view is. Resolved by the controller. */
export interface StatsViewer {
  userId: string;
  /** `all` = HR/Admin, `team` = Team Lead roster, `self` = own records only. */
  scope: 'all' | 'team' | 'self';
}

interface StatsScope {
  /** null means unrestricted; an empty set means "nothing visible". */
  employeeIds: Set<string> | null;
}
