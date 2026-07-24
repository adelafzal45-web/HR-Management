import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PerformanceReview } from './performance-review.entity';
import { User } from '../users/user.entity';
import { AppraisalQuestion } from '../appraisal-question/appraisal-question.entity';

import { CreatePerformanceReviewDto } from './dto/create-performance-review.dto';
import { UpdatePerformanceReviewDto } from './dto/update-performance-review.dto';

@Injectable()
export class PerformanceReviewService {
  constructor(
    @InjectRepository(PerformanceReview)
    private readonly performanceReviewRepository: Repository<PerformanceReview>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(AppraisalQuestion)
    private readonly appraisalQuestionRepository: Repository<AppraisalQuestion>,
  ) {}

  async create(createPerformanceReviewDto: CreatePerformanceReviewDto) {
    const user = await this.userRepository.findOne({
      where: {
        user_id: createPerformanceReviewDto.user_id,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const appraisalQuestion = await this.appraisalQuestionRepository.findOne({
      where: {
        question_id: createPerformanceReviewDto.question_id,
      },
    });

    if (!appraisalQuestion) {
      throw new NotFoundException('Appraisal Question not found');
    }

    const performanceReview = this.performanceReviewRepository.create({
      review_period: createPerformanceReviewDto.review_period,
      rating: createPerformanceReviewDto.rating,
      comments: createPerformanceReviewDto.comments,
      review_date: createPerformanceReviewDto.review_date,
      user,
      appraisalQuestion,
    });

    return await this.performanceReviewRepository.save(performanceReview);
  }

  async findAll() {
    return await this.performanceReviewRepository.find({
      relations: ['user', 'appraisalQuestion'],
    });
  }

  async findOne(id: string) {
    const performanceReview = await this.performanceReviewRepository.findOne({
      where: {
        review_id: id,
      },
      relations: ['user', 'appraisalQuestion'],
    });

    if (!performanceReview) {
      throw new NotFoundException('Performance Review not found');
    }

    return performanceReview;
  }

  async update(
    id: string,
    updatePerformanceReviewDto: UpdatePerformanceReviewDto,
  ) {
    const performanceReview = await this.findOne(id);

    if (updatePerformanceReviewDto.user_id) {
      const user = await this.userRepository.findOne({
        where: {
          user_id: updatePerformanceReviewDto.user_id,
        },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      performanceReview.user = user;
    }

    if (updatePerformanceReviewDto.question_id) {
      const appraisalQuestion = await this.appraisalQuestionRepository.findOne({
        where: {
          question_id: updatePerformanceReviewDto.question_id,
        },
      });

      if (!appraisalQuestion) {
        throw new NotFoundException('Appraisal Question not found');
      }

      performanceReview.appraisalQuestion = appraisalQuestion;
    }

    if (updatePerformanceReviewDto.review_period !== undefined) {
      performanceReview.review_period =
        updatePerformanceReviewDto.review_period;
    }

    if (updatePerformanceReviewDto.rating !== undefined) {
      performanceReview.rating = updatePerformanceReviewDto.rating;
    }

    if (updatePerformanceReviewDto.comments !== undefined) {
      performanceReview.comments = updatePerformanceReviewDto.comments;
    }

    if (updatePerformanceReviewDto.review_date !== undefined) {
      performanceReview.review_date = updatePerformanceReviewDto.review_date;
    }

    return await this.performanceReviewRepository.save(performanceReview);
  }

  async remove(id: string) {
    const performanceReview = await this.findOne(id);

    return await this.performanceReviewRepository.remove(performanceReview);
  }
}
