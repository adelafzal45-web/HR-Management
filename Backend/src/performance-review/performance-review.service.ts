import { Injectable, NotFoundException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

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

  // ==========================================
  // CREATE PERFORMANCE REVIEW
  // ==========================================

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

    const review = this.performanceReviewRepository.create({
      appraisalForm,

      reviewer,

      reviewee,

      evaluation_type: createDto.evaluation_type,

      review_period: createDto.review_period,

      review_date: new Date(createDto.review_date),

      total_score_percentage: createDto.total_score_percentage ?? 0,

      status: createDto.status ?? 'Draft',

      comments: createDto.comments,
    });

    return await this.performanceReviewRepository.save(review);
  }

  // ==========================================
  // CREATE AUTOMATIC ZERO REVIEW
  // WHEN USER IS ABSENT
  // ==========================================

  async createAbsentReview(attendance: Attendance) {
    const user = attendance.user;

    /*
      Find appraisal form
      assigned to this employee.

      Currently taking active form.
      Later we will filter by:
      department + designation
    */

    const appraisalForm = await this.appraisalFormsRepository.findOne({
      where: {
        status: 'Published',
      },
    });

    if (!appraisalForm) {
      throw new NotFoundException('Published appraisal form not found');
    }

    const review = this.performanceReviewRepository.create({
      appraisalForm,

      // For absent auto review
      // reviewer will be system/admin

      reviewer: user,

      reviewee: user,

      attendance,

      evaluation_type: appraisalForm.evaluation_type,

      review_period: attendance.attendance_date.toString(),

      review_date: attendance.attendance_date,

      total_score_percentage: 0,

      status: 'Completed',

      comments: 'Automatic zero evaluation because employee was absent',
    });

    return await this.performanceReviewRepository.save(review);
  }

  // ==========================================
  // GET ALL
  // ==========================================

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

  // ==========================================
  // GET ONE
  // ==========================================

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

  // ==========================================
  // UPDATE
  // ==========================================

  async update(id: string, updateDto: UpdatePerformanceReviewDto) {
    const review = await this.findOne(id);

    Object.assign(review, updateDto);

    return await this.performanceReviewRepository.save(review);
  }

  // ==========================================
  // DELETE
  // ==========================================

  async remove(id: string) {
    const review = await this.findOne(id);

    await this.performanceReviewRepository.remove(review);

    return {
      message: 'Performance Review deleted successfully',
    };
  }
}
