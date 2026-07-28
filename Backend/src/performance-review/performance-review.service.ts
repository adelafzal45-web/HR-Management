import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PerformanceReview } from './performance-review.entity';

import { User } from '../users/user.entity';

import { CreatePerformanceReviewDto } from './dto/create-performance-review.dto';
import { UpdatePerformanceReviewDto } from './dto/update-performance-review.dto';

@Injectable()
export class PerformanceReviewService {
  constructor(
    @InjectRepository(PerformanceReview)
    private readonly performanceReviewRepository: Repository<PerformanceReview>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // =========================
  // CREATE
  // =========================

  async create(createDto: CreatePerformanceReviewDto) {
    const reviewer = await this.userRepository.findOne({
      where: {
        user_id: createDto.reviewer_id,
      },
    });

    if (!reviewer) {
      throw new NotFoundException('Reviewer employee not found');
    }

    const reviewee = await this.userRepository.findOne({
      where: {
        user_id: createDto.reviewee_id,
      },
    });

    if (!reviewee) {
      throw new NotFoundException('Reviewee employee not found');
    }

    const review = this.performanceReviewRepository.create({
      reviewer,
      reviewee,
      review_period: createDto.review_period,
      review_date: new Date(createDto.review_date),
      total_score_percentage: createDto.total_score_percentage,
      comments: createDto.comments,
    });

    return this.performanceReviewRepository.save(review);
  }

  // =========================
  // GET ALL
  // =========================

  findAll() {
    return this.performanceReviewRepository.find({
      relations: [
        'reviewer',
        'reviewee',
        'answers',
      ],
    });
  }

  // =========================
  // GET ONE
  // =========================

  async findOne(id: string) {
    const review = await this.performanceReviewRepository.findOne({
      where: {
        review_id: id,
      },
      relations: [
        'reviewer',
        'reviewee',
        'answers',
      ],
    });

    if (!review) {
      throw new NotFoundException('Performance review not found');
    }

    return review;
  }

  // =========================
  // UPDATE
  // =========================

  async update(
    id: string,
    updateDto: UpdatePerformanceReviewDto,
  ) {
    const review = await this.performanceReviewRepository.findOne({
      where: {
        review_id: id,
      },
    });

    if (!review) {
      throw new NotFoundException('Performance review not found');
    }

    if (updateDto.reviewer_id) {
      const reviewer = await this.userRepository.findOne({
        where: {
          user_id: updateDto.reviewer_id,
        },
      });

      if (!reviewer) {
        throw new NotFoundException('Reviewer employee not found');
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
        throw new NotFoundException('Reviewee employee not found');
      }

      review.reviewee = reviewee;
    }

    if (updateDto.review_period !== undefined) {
      review.review_period = updateDto.review_period;
    }

    if (updateDto.review_date !== undefined) {
      review.review_date = new Date(updateDto.review_date);
    }

    if (updateDto.total_score_percentage !== undefined) {
      review.total_score_percentage =
        updateDto.total_score_percentage;
    }

    if (updateDto.comments !== undefined) {
      review.comments = updateDto.comments;
    }

    return this.performanceReviewRepository.save(review);
  }

  // =========================
  // DELETE
  // =========================

  async remove(id: string) {
    const review = await this.performanceReviewRepository.findOne({
      where: {
        review_id: id,
      },
    });

    if (!review) {
      throw new NotFoundException('Performance review not found');
    }

    await this.performanceReviewRepository.remove(review);

    return {
      message: 'Performance review deleted successfully',
    };
  }
}