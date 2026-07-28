import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { PerformanceReviewAnswer } from './performance-review-answer.entity';

import { PerformanceReview } from '../performance-review/performance-review.entity';
import { AppraisalQuestion } from '../appraisal-question/appraisal-question.entity';
import { AppraisalQuestionOption } from '../apprisal-question-options/apprisal-question-options.entity';

import { CreatePerformanceReviewAnswerDto } from './dto/create.dto';
import { UpdatePerformanceReviewAnswerDto } from './dto/update.dto';

@Injectable()
export class PerformanceReviewAnswerService {
  constructor(
    @InjectRepository(PerformanceReviewAnswer)
    private readonly answerRepository: Repository<PerformanceReviewAnswer>,

    @InjectRepository(PerformanceReview)
    private readonly reviewRepository: Repository<PerformanceReview>,

    @InjectRepository(AppraisalQuestion)
    private readonly questionRepository: Repository<AppraisalQuestion>,

    @InjectRepository(AppraisalQuestionOption)
    private readonly optionRepository: Repository<AppraisalQuestionOption>,
  ) {}

  // ==========================================
  // CREATE
  // ==========================================

  async create(
    createDto: CreatePerformanceReviewAnswerDto,
  ) {
    // Check review
    const review = await this.reviewRepository.findOne({
      where: {
        review_id: createDto.review_id,
      },
    });

    if (!review) {
      throw new NotFoundException(
        'Performance review not found',
      );
    }

    // Check question
    const question = await this.questionRepository.findOne({
      where: {
        question_id: createDto.question_id,
      },
    });

    if (!question) {
      throw new NotFoundException(
        'Appraisal question not found',
      );
    }

    // Check selected option if provided
    let selectedOption: AppraisalQuestionOption | undefined;

    if (createDto.selected_option_id) {
      const option = await this.optionRepository.findOne({
        where: {
          option_id: createDto.selected_option_id,
        },
        relations: ['question'],
      });

      if (!option) {
        throw new NotFoundException(
          'Appraisal question option not found',
        );
      }

      // Make sure option belongs to this question
      if (
        option.question.question_id !==
        question.question_id
      ) {
        throw new NotFoundException(
          'Selected option does not belong to this question',
        );
      }

      selectedOption = option;
    }

    const answer = this.answerRepository.create({
      review,
      question,
      selectedOption,
      answer_comment: createDto.answer_comment,
      answered_percentage:
        createDto.answered_percentage,
    });

    return this.answerRepository.save(answer);
  }

  // ==========================================
  // GET ALL
  // ==========================================

  findAll() {
    return this.answerRepository.find({
      relations: [
        'review',
        'question',
        'selectedOption',
      ],
    });
  }

  // ==========================================
  // GET ONE
  // ==========================================

  async findOne(id: string) {
    const answer = await this.answerRepository.findOne({
      where: {
        answer_id: id,
      },
      relations: [
        'review',
        'question',
        'selectedOption',
      ],
    });

    if (!answer) {
      throw new NotFoundException(
        'Performance review answer not found',
      );
    }

    return answer;
  }

  // ==========================================
  // UPDATE
  // ==========================================

  async update(
    id: string,
    updateDto: UpdatePerformanceReviewAnswerDto,
  ) {
    const answer = await this.answerRepository.findOne({
      where: {
        answer_id: id,
      },
      relations: [
        'review',
        'question',
        'selectedOption',
      ],
    });

    if (!answer) {
      throw new NotFoundException(
        'Performance review answer not found',
      );
    }

    // Update review
    if (updateDto.review_id) {
      const review =
        await this.reviewRepository.findOne({
          where: {
            review_id: updateDto.review_id,
          },
        });

      if (!review) {
        throw new NotFoundException(
          'Performance review not found',
        );
      }

      answer.review = review;
    }

    // Update question
    if (updateDto.question_id) {
      const question =
        await this.questionRepository.findOne({
          where: {
            question_id: updateDto.question_id,
          },
        });

      if (!question) {
        throw new NotFoundException(
          'Appraisal question not found',
        );
      }

      answer.question = question;
    }

    // Update selected option
    if (updateDto.selected_option_id) {
      const option =
        await this.optionRepository.findOne({
          where: {
            option_id: updateDto.selected_option_id,
          },
          relations: ['question'],
        });

      if (!option) {
        throw new NotFoundException(
          'Appraisal question option not found',
        );
      }

      if (
        option.question.question_id !==
        answer.question.question_id
      ) {
        throw new NotFoundException(
          'Selected option does not belong to this question',
        );
      }

      answer.selectedOption = option;
    }

    if (updateDto.answer_comment !== undefined) {
      answer.answer_comment =
        updateDto.answer_comment;
    }

    if (
      updateDto.answered_percentage !== undefined
    ) {
      answer.answered_percentage =
        updateDto.answered_percentage;
    }

    return this.answerRepository.save(answer);
  }

  // ==========================================
  // DELETE
  // ==========================================

  async remove(id: string) {
    const answer = await this.answerRepository.findOne({
      where: {
        answer_id: id,
      },
    });

    if (!answer) {
      throw new NotFoundException(
        'Performance review answer not found',
      );
    }

    await this.answerRepository.remove(answer);

    return {
      message:
        'Performance review answer deleted successfully',
    };
  }
}