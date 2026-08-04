import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';

import { PerformanceReview } from './performance-review.entity';
import { User } from '../users/user.entity';
import { Attendance } from '../attendance/attendance.entity';
import { AppraisalForms } from '../appraisal-forms/appraisal-forms.entity';

import { CreatePerformanceReviewDto } from './dto/create-performance-review.dto';
import { UpdatePerformanceReviewDto } from './dto/update-performance-review.dto';

@Injectable()
export class PerformanceReviewService {
  constructor(
    @InjectRepository(PerformanceReview)
    private readonly performanceReviewRepository: Repository<PerformanceReview>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(AppraisalForms)
    private readonly appraisalFormsRepository: Repository<AppraisalForms>,

    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
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

  async createAbsentReview(attendance: Attendance) {
    const user = attendance.user;

    const appraisalForm = await this.appraisalFormsRepository.findOne({
      where: {
        status: 'Published',
      },
    });

    if (!appraisalForm) {
      throw new NotFoundException('Published appraisal form not found');
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
        : new Date(`${String(attendance.attendance_date).slice(0, 10)}T00:00:00Z`);

    const review = this.performanceReviewRepository.create({
      appraisalForm,
      reviewer: user,
      reviewee: user,
      attendance,
      evaluation_type: appraisalForm.evaluation_type,
      // Date-only: the column is varchar(50) and the period is a day, so the
      // full timestamp added noise without adding information.
      review_period: attendanceDate.toISOString().slice(0, 10),
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

    return await this.performanceReviewRepository.save(review);
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
