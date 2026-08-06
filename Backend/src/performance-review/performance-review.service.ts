import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';

import { PerformanceReview } from './performance-review.entity';
import { LOCKED_REVIEW_STATUSES } from './performance-review.constants';
import { User } from '../users/user.entity';
import { Attendance } from '../attendance/attendance.entity';
import { AppraisalForms } from '../appraisal-forms/appraisal-forms.entity';
import { AppraisalFormResolverService } from '../appraisal-forms/appraisal-form-resolver.service';
import { cadenceFor } from '../appraisal-facade/evaluation-cadence';
import { isUniqueViolation } from '../common/typeorm-errors';

import { CreatePerformanceReviewDto } from './dto/create-performance-review.dto';
import { UpdatePerformanceReviewDto } from './dto/update-performance-review.dto';

@Injectable()
export class PerformanceReviewService {
  private readonly logger = new Logger(PerformanceReviewService.name);

  constructor(
    @InjectRepository(PerformanceReview)
    private readonly performanceReviewRepository: Repository<PerformanceReview>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(AppraisalForms)
    private readonly appraisalFormsRepository: Repository<AppraisalForms>,

    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,

    private readonly formResolver: AppraisalFormResolverService,
  ) {}

  // ======================================================
  // CREATE PERFORMANCE REVIEW
  // ======================================================

  async create(createDto: CreatePerformanceReviewDto) {
    const reviewer = await this.userRepository.findOne({
      where: {
        user_id: createDto.reviewer_id,
      },
    });

    if (!reviewer) {
      throw new NotFoundException('Reviewer not found');
    }

    const reviewee = await this.userRepository.findOne({
      where: {
        user_id: createDto.reviewee_id,
      },
    });

    if (!reviewee) {
      throw new NotFoundException('Reviewee not found');
    }

    const appraisalForm = await this.appraisalFormsRepository.findOne({
      where: {
        form_id: createDto.form_id,
      },
    });

    if (!appraisalForm) {
      throw new NotFoundException('Appraisal Form not found');
    }

    const attendance = await this.attendanceRepository.findOne({
      where: {
        attendance_id: createDto.attendance_id,
      },
    });

    if (!attendance) {
      throw new NotFoundException('Attendance not found');
    }

    const review = this.performanceReviewRepository.create({
      appraisalForm,
      reviewer,
      reviewee,
      attendance,
      evaluation_type: createDto.evaluation_type,
      review_period: createDto.review_period,
      review_date: new Date(createDto.review_date),
      total_score_percentage: createDto.total_score_percentage ?? 0,
      status: createDto.status ?? 'Draft',
      comments: createDto.comments,
    });

    return await this.performanceReviewRepository.save(review);
  }

  // ======================================================
  // CREATE AUTO ZERO REVIEW
  // ======================================================

  /**
   * Writes the zero-score review that stands in for an absent day.
   *
   * Everything here is best-effort by design: the attendance row it belongs to
   * has already been committed by the caller, so throwing would report a failure
   * for a save that actually succeeded. Each way this can legitimately not apply
   * returns null with a log line instead.
   *
   * Returns the review when one was written or already existed, null when the
   * absence produced none.
   */
  async createAbsentReview(
    attendance: Attendance,
  ): Promise<PerformanceReview | null> {
    const user = attendance.user;

    if (!user?.user_id) {
      this.logger.warn(
        `Attendance ${attendance.attendance_id} is marked Absent but carries no user; skipping the auto-zero review.`,
      );
      return null;
    }

    // The employee's *assigned* form, resolved exactly the way the scheduler and
    // the evaluate-permission check resolve it: direct -> designation ->
    // department, Published and active only.
    //
    // This used to be `findOne({ where: { status: 'Published' } })` — the first
    // published form in the table, whichever that happened to be. Every absence
    // in the company was scored against that one form regardless of who the
    // employee was, which put rows in `performance_reviews` for a form the
    // employee was never assigned and then collided with the real review when
    // the lead came to write it.
    const appraisalForm = await this.formResolver.resolveFormForEmployee(
      user.user_id,
    );

    if (!appraisalForm) {
      // Not an error. An employee HR has not covered by any assignment simply
      // has no appraisal, and their attendance still needs recording.
      this.logger.log(
        `No published appraisal form is assigned to ${user.user_id}; no auto-zero review written for ${attendance.attendance_id}.`,
      );
      return null;
    }

    // attendance_date is declared as a Date but does not always hold one: the
    // create DTO validates it with @IsDateString(), which checks the format
    // without converting, so a freshly-saved record carries the raw
    // 'YYYY-MM-DD' string straight from the request body. Calling toISOString()
    // on that threw, and because the attendance row had already been committed
    // the caller got a 500 on top of a half-completed write. Normalise here
    // rather than at the call site — this is reached from every Absent create
    // and update path.
    const attendanceDate =
      attendance.attendance_date instanceof Date
        ? attendance.attendance_date
        : new Date(
            `${String(attendance.attendance_date).slice(0, 10)}T00:00:00Z`,
          );

    const cadence = cadenceFor(appraisalForm.evaluation_type);

    // One absent day only speaks for the whole period when the period *is* one
    // day. On a Weekly or Monthly form, zeroing and locking the period over a
    // single absence would destroy the lead's real evaluation for that week or
    // month — four days of good work included. Asked cadence-agnostically, so
    // this stays correct if Quarterly or Yearly is added later.
    const periodStart = cadence.periodStart(attendanceDate);
    const periodEnd = cadence.periodEnd(attendanceDate);
    if (periodStart.getTime() !== periodEnd.getTime()) {
      this.logger.log(
        `${appraisalForm.form_name} is ${appraisalForm.evaluation_type}; one absent day does not zero the whole period, so no auto-zero review was written for ${user.user_id}.`,
      );
      return null;
    }

    // Cadence-aware, so this matches the key the scheduler and the submit path
    // write. A hardcoded 'YYYY-MM-DD' put the absence in a period no other code
    // would ever look for.
    const reviewPeriod = cadence.periodKey(attendanceDate);

    // The unique index is on (reviewee_id, form_id, review_period), so that is
    // exactly what is looked up — a narrower query is a query that misses a row
    // the insert will then collide with.
    const existing = await this.performanceReviewRepository.findOne({
      where: {
        reviewee: { user_id: user.user_id },
        appraisalForm: { form_id: appraisalForm.form_id },
        review_period: reviewPeriod,
      },
      relations: { answers: true },
    });

    if (existing && LOCKED_REVIEW_STATUSES.includes(existing.status)) {
      // Already submitted — by the lead, by HR, or by an earlier run of this
      // same code. Nothing to do, and certainly nothing to overwrite.
      this.logger.log(
        `Review ${existing.review_id} already covers ${user.user_id} for ${reviewPeriod}; leaving it as ${existing.status}.`,
      );
      return existing;
    }

    if (existing && (existing.answers?.length ?? 0) > 0) {
      // A Draft someone has actually started answering. Forcing it to zero would
      // throw away their work and leave the stored answers contradicting the
      // total, so the absence is recorded on the attendance row only and the
      // reviewer decides what the day was worth.
      this.logger.log(
        `Review ${existing.review_id} for ${reviewPeriod} already has answers; leaving the in-progress draft alone rather than zeroing it.`,
      );
      return existing;
    }

    // An empty Draft here is the scheduler's placeholder for the same period.
    // Taking it over rather than inserting alongside it is what makes the
    // absence visible at all: on a Daily form the placeholder exists by the time
    // the shift starts, so an insert would always lose to the index.
    const review = existing ?? new PerformanceReview();

    Object.assign(review, {
      appraisalForm,
      reviewer: user,
      reviewee: user,
      attendance,
      evaluation_type: appraisalForm.evaluation_type,
      review_period: reviewPeriod,
      review_date: attendanceDate,
      total_score_percentage: 0,
      // 'Submitted', not the legacy 'Completed' the AppraisalDynamicForms
      // migration folded away. An absence review is final the moment it is
      // written — there is nothing for a reviewer to fill in — so it starts in a
      // locked state and HR can reopen it if the absence turns out to be wrong.
      status: 'Submitted',
      submitted_at: new Date(),
      locked_at: new Date(),
      is_auto_generated: true,
      comments: 'Automatic zero evaluation because employee was absent',
    });

    try {
      return await this.performanceReviewRepository.save(review);
    } catch (error) {
      if (isUniqueViolation(error)) {
        // The scheduler or a concurrent request landed the row between the
        // lookup above and this write. Their row is as good as ours, so this is
        // a no-op rather than a failure.
        this.logger.warn(
          `A review for ${user.user_id} / ${reviewPeriod} was created concurrently; the auto-zero write was skipped.`,
        );
        return null;
      }
      throw error;
    }
  }

  // ======================================================
  // GET ALL
  // ======================================================

  async findAll() {
    return await this.performanceReviewRepository.find({
      relations: [
        'appraisalForm',
        'reviewer',
        'reviewee',
        'attendance',
        'answers',
      ],
    });
  }

  // ======================================================
  // GET ONE
  // ======================================================

  async findOne(id: string) {
    const review = await this.performanceReviewRepository.findOne({
      where: {
        review_id: id,
      },
      relations: [
        'appraisalForm',
        'reviewer',
        'reviewee',
        'attendance',
        'answers',
      ],
    });

    if (!review) {
      throw new NotFoundException('Performance Review not found');
    }

    return review;
  }

  // ======================================================
  // UPDATE
  // ======================================================

  async update(id: string, updateDto: UpdatePerformanceReviewDto) {
    const review = await this.findOne(id);

    if (updateDto.form_id) {
      const appraisalForm = await this.appraisalFormsRepository.findOne({
        where: {
          form_id: updateDto.form_id,
        },
      });

      if (!appraisalForm) {
        throw new NotFoundException('Appraisal Form not found');
      }

      review.appraisalForm = appraisalForm;
    }

    if (updateDto.reviewer_id) {
      const reviewer = await this.userRepository.findOne({
        where: {
          user_id: updateDto.reviewer_id,
        },
      });

      if (!reviewer) {
        throw new NotFoundException('Reviewer not found');
      }

      review.reviewer = reviewer;
    }

    if (updateDto.reviewee_id) {
      const reviewee = await this.userRepository.findOne({
        where: {
          user_id: updateDto.reviewee_id,
        },
      });

      if (!reviewee) {
        throw new NotFoundException('Reviewee not found');
      }

      review.reviewee = reviewee;
    }

    if (updateDto.attendance_id) {
      const attendance = await this.attendanceRepository.findOne({
        where: {
          attendance_id: updateDto.attendance_id,
        },
      });

      if (!attendance) {
        throw new NotFoundException('Attendance not found');
      }

      review.attendance = attendance;
    }

    if (updateDto.evaluation_type !== undefined) {
      review.evaluation_type = updateDto.evaluation_type;
    }

    if (updateDto.review_period !== undefined) {
      review.review_period = updateDto.review_period;
    }

    if (updateDto.review_date !== undefined) {
      review.review_date = new Date(updateDto.review_date);
    }

    if (updateDto.total_score_percentage !== undefined) {
      review.total_score_percentage = updateDto.total_score_percentage;
    }

    if (updateDto.status !== undefined) {
      review.status = updateDto.status;
    }

    if (updateDto.comments !== undefined) {
      review.comments = updateDto.comments;
    }

    return await this.performanceReviewRepository.save(review);
  }

  // ======================================================
  // RECALCULATE AGGREGATE SCORE
  // ======================================================

  /**
   * Recomputes `total_score_percentage` for a review from its answers.
   *
   * Each answer stores `answered_percentage` (0–100) and its form question
   * carries `weight_percentage`. Active weights are required to total 100, so
   * the weighted mean is simply `Σ(answered × weight) / Σ(weight)`. Dividing
   * by the actual weight sum (rather than assuming 100) keeps the result
   * meaningful if a review was captured while weights were mid-edit.
   *
   * Pass the transaction's `EntityManager` when calling from inside a
   * transaction so the read sees the uncommitted answers.
   */
  async recalculateReviewScore(
    reviewId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const reviewRepo = manager
      ? manager.getRepository(PerformanceReview)
      : this.performanceReviewRepository;

    const review = await reviewRepo.findOne({
      where: { review_id: reviewId },
      relations: { answers: { formQuestion: true } },
    });

    if (!review) {
      throw new NotFoundException('Performance Review not found');
    }

    let weightedSum = 0;
    let weightTotal = 0;

    for (const answer of review.answers ?? []) {
      const weight = Number(answer.formQuestion?.weight_percentage ?? 0);
      if (weight <= 0) continue;
      weightedSum += Number(answer.answered_percentage ?? 0) * weight;
      weightTotal += weight;
    }

    const score = weightTotal > 0 ? weightedSum / weightTotal : 0;
    // Column is decimal(5,2).
    review.total_score_percentage = Math.round(score * 100) / 100;

    await reviewRepo.save(review);

    return review.total_score_percentage;
  }

  // ======================================================
  // DELETE
  // ======================================================

  async remove(id: string) {
    const review = await this.findOne(id);

    await this.performanceReviewRepository.remove(review);

    return {
      message: 'Performance Review deleted successfully',
    };
  }
}
