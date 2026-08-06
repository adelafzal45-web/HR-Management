import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';

import { User } from '../users/user.entity';
import { Attendance } from '../attendance/attendance.entity';
import {
  AppraisalForms,
  FormStatus,
} from '../appraisal-forms/appraisal-forms.entity';
import { PerformanceReview } from '../performance-review/performance-review.entity';
import {
  AppraisalNotification,
  AppraisalNotificationType,
} from '../appraisal-notifications/appraisal-notification.entity';
import { WorkingDaySchedulesService } from '../working-day-schedules/working-day-schedules.service';
import { MailService } from '../mail/mail.service';

import { AppraisalFacadeService } from './appraisal-facade.service';
import {
  cadenceFor,
  dateKey,
  previousPeriods,
  type CadenceContext,
} from './evaluation-cadence';

/** How long before shift end the reminder fires, and the tolerance around it. */
const REMINDER_LEAD_MINUTES = 60;
const REMINDER_WINDOW_MINUTES = 8;

/** Bound on rows touched per tick, so one slow pass cannot stack on the next. */
const MAX_PER_TICK = 500;

/**
 * The three background jobs behind the appraisal vertical.
 *
 * Each is modelled on `mail/mail-queue.processor.ts`, and for the same reasons:
 *
 *  - **A re-entrancy flag per job.** `@Cron` fires on a timer whether or not the
 *    previous run finished. A generation pass over a few hundred employees can
 *    outlast its interval, and two copies of it racing would both see "no review
 *    for this period" and both insert one.
 *  - **A try/catch around the whole body.** An unhandled rejection inside a cron
 *    handler kills the schedule for the rest of the process lifetime, so a single
 *    bad row would silently stop all future runs.
 *  - **A kill-switch.** `APPRAISAL_JOBS_ENABLED=false` disables them anywhere,
 *    and they are off by default under `NODE_ENV=test` so a suite that creates
 *    employees does not generate reviews or mail anyone.
 *
 * Correctness here rests on database constraints rather than on the jobs running
 * exactly once: `UQ_pr_reviewee_form_period` makes generation idempotent, and
 * `UQ_an_dedupe_key` makes the reminder idempotent. That is deliberate — a cron
 * that must not double-fire is a cron that breaks on the first restart.
 */
@Injectable()
export class AppraisalSchedulerService {
  private readonly logger = new Logger(AppraisalSchedulerService.name);

  private generating = false;
  private reminding = false;
  private marking = false;

  constructor(
    private readonly dataSource: DataSource,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(AppraisalForms)
    private readonly formRepository: Repository<AppraisalForms>,

    @InjectRepository(PerformanceReview)
    private readonly reviewRepository: Repository<PerformanceReview>,

    @InjectRepository(AppraisalNotification)
    private readonly notificationRepository: Repository<AppraisalNotification>,

    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,

    private readonly workingDays: WorkingDaySchedulesService,

    private readonly facade: AppraisalFacadeService,

    private readonly mail: MailService,
  ) {}

  private get enabled(): boolean {
    const flag = process.env.APPRAISAL_JOBS_ENABLED;
    if (flag !== undefined) {
      return flag !== 'false' && flag !== '0';
    }
    return process.env.NODE_ENV !== 'test';
  }

  // ==========================================================================
  // 1. Auto-generate evaluation entries
  // ==========================================================================

  /**
   * Creates the `Draft` placeholder each reviewer is expected to fill in.
   *
   * Hourly rather than daily: a form published or assigned mid-morning should
   * produce today's entries without waiting for tomorrow, and the unique index on
   * `(reviewee_id, form_id, review_period)` means the extra passes are no-ops.
   *
   * *When* an entry is due is not decided here — it is delegated to the form's
   * `EvaluationCadence` (see `evaluation-cadence.ts`). This job only knows how
   * to ask "is this due for this employee today", which is what makes adding
   * Quarterly or Yearly a new cadence object rather than another branch in here.
   *
   * The reviewer is the employee's Team Lead. An employee with no lead is skipped
   * rather than assigned to HR — a review whose `reviewer_id` is nobody's
   * responsibility shows up in no dashboard and just inflates the pending count
   * forever.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async generateEvaluationEntries(): Promise<void> {
    if (!this.enabled || this.generating) return;

    this.generating = true;
    try {
      const now = new Date();

      const forms = await this.formRepository.find({
        where: { status: FormStatus.PUBLISHED, is_active: true },
      });
      if (forms.length === 0) return;

      const employees = await this.userRepository.find({
        where: { status: true },
        relations: {
          department: true,
          designation: true,
          teamLead: true,
          // Needed for the Daily pre-shift window.
          shift: true,
        },
        take: MAX_PER_TICK,
      });
      if (employees.length === 0) return;

      const formsById = new Map(forms.map((form) => [form.form_id, form]));
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      // One working-day lookup per (date, scope) per tick instead of per
      // employee. `lastWorkingDay` walks up to 31 days back for a Monthly form,
      // so without this a few hundred employees would mean thousands of
      // identical queries every hour.
      const workingDayCache = new Map<string, Promise<boolean>>();
      const isWorkingDay = (
        date: Date,
        departmentId?: string | null,
        designationId?: string | null,
      ): Promise<boolean> => {
        const key = `${dateKey(date)}|${departmentId ?? ''}|${designationId ?? ''}`;
        const hit = workingDayCache.get(key);
        if (hit) return hit;

        const lookup = this.workingDays.isWorkingDay(
          date,
          departmentId ?? null,
          designationId ?? null,
        );
        workingDayCache.set(key, lookup);
        return lookup;
      };

      let created = 0;

      for (const employee of employees) {
        // Resolve once per employee, not once per (form, employee): the ladder
        // already picks the single winning form, so the outer loop over forms
        // was re-answering the same question for every other form.
        const resolved = await this.facade.resolveFormForEmployee(
          employee.user_id,
        );
        if (!resolved) continue;

        const form = formsById.get(resolved.form_id);
        if (!form) continue;

        // Normally the reviewer is the employee's Team Lead. The exception is an
        // evaluator with an empty roster: HR named their designation on the
        // form, so they owe an evaluation but have nobody to write one about.
        // `selfReviewEligibility` is the same rule the submit guard applies, so
        // a placeholder is only ever generated where a submission would be
        // accepted.
        let reviewerId = employee.team_lead_id ?? null;

        if (!reviewerId || reviewerId === employee.user_id) {
          const visibleIds = await this.facade.resolveVisibleEmployeeIds(
            employee.user_id,
          );
          const { allowed } = await this.facade.selfReviewEligibility(
            employee,
            visibleIds,
          );
          if (!allowed) continue;
          reviewerId = employee.user_id;
        }

        const cadence = cadenceFor(form.evaluation_type);
        const ctx: CadenceContext = {
          departmentId: employee.department?.department_id ?? null,
          designationId: employee.designation?.designation_id ?? null,
          shiftStartMinutes: employee.shift?.start_time
            ? this.timeToMinutes(employee.shift.start_time)
            : null,
          nowMinutes,
          isWorkingDay,
        };

        // The current period, plus any recently closed one the cadence still
        // wants backfilled. Closed periods come second so a live period is
        // never starved by a backlog.
        const candidates: Date[] = [
          now,
          ...previousPeriods(cadence, now, cadence.backfillPeriods),
        ];

        for (const periodDate of candidates) {
          const isBackfill = periodDate !== now;

          // A form cannot owe a review for a period that ended before it
          // existed. Without this, publishing a Monthly form on the 3rd would
          // immediately conjure last month's evaluation out of nothing.
          if (
            isBackfill &&
            form.created_at &&
            new Date(form.created_at).getTime() >
              cadence.periodEnd(periodDate).getTime()
          ) {
            continue;
          }

          // For a closed period the due day has necessarily passed, so the
          // question is only "did this period have a working day at all".
          const due = isBackfill
            ? await cadence.isDueOn(cadence.periodEnd(periodDate), ctx)
            : await cadence.isDueOn(now, ctx);
          if (!due) continue;

          const period = cadence.periodKey(periodDate);

          const existing = await this.reviewRepository.findOne({
            where: {
              reviewee: { user_id: employee.user_id },
              appraisalForm: { form_id: form.form_id },
              review_period: period,
            },
          });
          if (existing) continue;

          try {
            await this.reviewRepository.save(
              this.reviewRepository.create({
                appraisalForm: form,
                reviewer: { user_id: reviewerId } as User,
                reviewee: employee,
                evaluation_type: form.evaluation_type,
                review_period: period,
                // A backfilled entry is dated inside the period it belongs to,
                // not today — otherwise last month's review would report as
                // having happened this month.
                review_date: isBackfill ? cadence.periodEnd(periodDate) : now,
                total_score_percentage: 0,
                status: 'Draft',
                is_auto_generated: true,
              }),
            );
            created += 1;

            if (isBackfill) {
              this.logger.warn(
                `Backfilled a missed ${form.evaluation_type} evaluation for ${employee.user_id} / ${period}.`,
              );
            }
          } catch (error) {
            // Almost certainly UQ_pr_reviewee_form_period: another instance won
            // the race between the check above and this insert. That is the
            // index doing its job, not a failure.
            this.logger.debug(
              `Skipped generating for ${employee.user_id} / ${period}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      }

      if (created > 0) {
        this.logger.log(`Generated ${created} draft evaluation entr(ies).`);
      }
    } catch (error) {
      this.logger.error(
        `generateEvaluationEntries failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.generating = false;
    }
  }

  // ==========================================================================
  // 2. Shift-end reminder
  // ==========================================================================

  /**
   * Reminds a Team Lead roughly an hour before their shift ends, if any of their
   * appraisals are still outstanding.
   *
   * Runs every 15 minutes against a ±8-minute window around the 60-minute mark,
   * so the target is caught exactly once by wall-clock arithmetic while the
   * `dedupe_key` unique index guarantees it regardless of how the schedule
   * drifts, restarts, or overlaps.
   *
   * `shifts.end_time` is a `time` column, so TypeORM hands it back as an
   * 'HH:MM:SS' string, not a Date. It is compared as local wall-clock minutes —
   * converting it through a Date would attach today's timezone offset to a value
   * that has none.
   */
  @Cron('0 */15 * * * *')
  async sendShiftReminders(): Promise<void> {
    if (!this.enabled || this.reminding) return;

    this.reminding = true;
    try {
      const now = new Date();
      const isWorking = await this.workingDays.isWorkingDay(now);
      if (!isWorking) return;

      const today = this.dateKey(now);
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      // Only leads: an employee with no reports has nothing to be reminded of.
      const leads = await this.userRepository
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.shift', 'shift')
        .where('user.status = true')
        .andWhere(
          // `user` is a reserved word in Postgres: unquoted, `user."user_id"`
          // is parsed as the USER keyword and the whole statement dies with
          // `syntax error at or near "."`. The alias has to stay quoted.
          `EXISTS (SELECT 1 FROM "users" AS report WHERE report."team_lead_id" = "user"."user_id" AND report."status" = true)`,
        )
        .take(MAX_PER_TICK)
        .getMany();

      let sent = 0;

      for (const lead of leads) {
        const endTime = lead.shift?.end_time;
        if (!endTime) continue;

        const endMinutes = this.timeToMinutes(endTime);
        if (endMinutes === null) continue;

        const minutesUntilEnd = endMinutes - nowMinutes;
        if (
          Math.abs(minutesUntilEnd - REMINDER_LEAD_MINUTES) >
          REMINDER_WINDOW_MINUTES
        ) {
          continue;
        }

        const pending = await this.reviewRepository.find({
          where: {
            reviewer: { user_id: lead.user_id },
            status: 'Draft',
            review_date: now as unknown as Date,
          },
          relations: { reviewee: true },
        });

        // Fall back to all outstanding drafts if none carry today's date —
        // weekly and monthly entries are dated on creation, not on the day they
        // are due, and those are exactly the ones a lead forgets.
        const outstanding =
          pending.length > 0
            ? pending
            : await this.reviewRepository.find({
                where: {
                  reviewer: { user_id: lead.user_id },
                  status: 'Draft',
                },
                relations: { reviewee: true },
                take: 50,
              });

        if (outstanding.length === 0) continue;

        const dedupeKey = `SHIFT_REMINDER:${lead.user_id}:${today}:${
          lead.shift?.shift_id ?? 'noshift'
        }`;

        const names = outstanding
          .map((review) =>
            `${review.reviewee?.first_name ?? ''} ${
              review.reviewee?.last_name ?? ''
            }`.trim(),
          )
          .filter(Boolean);

        try {
          await this.notificationRepository.insert({
            recipient: { user_id: lead.user_id } as User,
            type: AppraisalNotificationType.SHIFT_REMINDER,
            title: `${outstanding.length} appraisal form(s) pending`,
            message: `Your shift ends at ${endTime}. Still pending: ${
              names.slice(0, 10).join(', ') || 'assigned team members'
            }${names.length > 10 ? `, +${names.length - 10} more` : ''}.`,
            dedupe_key: dedupeKey,
          });
        } catch {
          // UQ_an_dedupe_key: already reminded for this lead, date and shift.
          // Skip the email too — the notification row is the record of whether
          // this reminder has gone out.
          continue;
        }

        if (lead.email) {
          await this.mail.enqueue({
            templateKey: 'appraisal_pending_reminder',
            to: lead.email,
            toName: `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim(),
            relatedUserId: lead.user_id,
            context: {
              team_lead_name: `${lead.first_name ?? ''} ${
                lead.last_name ?? ''
              }`.trim(),
              pending_count: outstanding.length,
              pending_employees: names.slice(0, 10).join(', '),
              shift_end_time: endTime,
              evaluation_date: today,
            },
          });
        }

        sent += 1;
      }

      if (sent > 0) {
        this.logger.log(`Sent ${sent} shift-end appraisal reminder(s).`);
      }
    } catch (error) {
      this.logger.error(
        `sendShiftReminders failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.reminding = false;
    }
  }

  // ==========================================================================
  // 3. Auto-absent marking
  // ==========================================================================

  /**
   * Marks an employee Absent once their shift has ended with no attendance row.
   *
   * Working days come from `WorkingDaySchedulesService`, never from a hardcoded
   * Monday–Friday check: the resolver already walks designation → department →
   * global, and duplicating the rule here would mean a department with a Saturday
   * schedule gets its whole staff marked absent every weekend.
   *
   * Writing the row goes through `AttendanceService`-equivalent logic only as far
   * as the row itself — the zero-score review that accompanies an absence is
   * created by `PerformanceReviewService.createAbsentReview`, which the attendance
   * module already calls on its own Absent paths. Calling it from here too would
   * double up, so this job deliberately writes attendance only and lets the
   * existing hook do the rest.
   */
  @Cron('0 */15 * * * *')
  async markAbsentees(): Promise<void> {
    if (!this.enabled || this.marking) return;

    this.marking = true;
    try {
      const now = new Date();
      const today = this.dateKey(now);
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      const employees = await this.userRepository.find({
        where: { status: true, shift: { shift_id: Not(IsNull()) } },
        relations: { shift: true, designation: true, department: true },
        take: MAX_PER_TICK,
      });

      let marked = 0;

      for (const employee of employees) {
        const endTime = employee.shift?.end_time;
        if (!endTime) continue;

        const endMinutes = this.timeToMinutes(endTime);
        if (endMinutes === null || nowMinutes < endMinutes) continue;

        const isWorking = await this.workingDays.isWorkingDay(
          now,
          employee.department?.department_id ?? null,
          employee.designation?.designation_id ?? null,
        );
        if (!isWorking) continue;

        const existing = await this.attendanceRepository.findOne({
          where: {
            user: { user_id: employee.user_id },
            attendance_date: today as unknown as Date,
          },
        });
        if (existing) continue;

        try {
          await this.attendanceRepository.insert({
            user: { user_id: employee.user_id } as User,
            shift: employee.shift,
            attendance_date: today as unknown as Date,
            attendance_status: 'Absent',
          });
          marked += 1;
        } catch (error) {
          this.logger.debug(
            `Could not mark ${employee.user_id} absent for ${today}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      if (marked > 0) {
        this.logger.log(`Marked ${marked} employee(s) absent for ${today}.`);
      }
    } catch (error) {
      this.logger.error(
        `markAbsentees failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.marking = false;
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Local calendar date as 'YYYY-MM-DD', avoiding toISOString's UTC shift.
   *
   * Re-exposed as a method because the reminder and absentee jobs use it for
   * dedupe keys and attendance dates. The period-key arithmetic that used to
   * live here now belongs to the cadences in `evaluation-cadence.ts`, so that
   * "which period is this" has exactly one answer.
   */
  private dateKey(date: Date): string {
    return dateKey(date);
  }

  /** 'HH:MM:SS' → minutes past midnight. Null if unparseable. */
  private timeToMinutes(time: string): number | null {
    const match = /^(\d{1,2}):(\d{2})/.exec(time);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
  }
}
