import { Injectable, NotFoundException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PerformanceReviewAnswer } from './performance-review-answer.entity';

import { PerformanceReview } from '../performance-review/performance-review.entity';

import { AppraisalFormQuestion } from '../appraisal-form-questions/appraisal-form-questions.entity';

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

    @InjectRepository(AppraisalFormQuestion)
    private readonly formQuestionRepository: Repository<AppraisalFormQuestion>,

    @InjectRepository(AppraisalQuestionOption)
    private readonly optionRepository: Repository<AppraisalQuestionOption>,
  ) {}

  // ==========================================
  // CREATE ANSWER
  // ==========================================

  async create(createDto: CreatePerformanceReviewAnswerDto) {
    const review = await this.reviewRepository.findOne({
      where: {
        review_id: createDto.review_id,
      },

      relations: ['attendance'],
    });

    if (!review) {
      throw new NotFoundException('Performance review not found');
    }

    const formQuestion = await this.formQuestionRepository.findOne({
      where: {
        form_question_id: createDto.form_question_id,
      },

      relations: ['question'],
    });

    if (!formQuestion) {
      throw new NotFoundException('Appraisal form question not found');
    }

    let selectedOption: AppraisalQuestionOption | undefined;

    if (createDto.selected_option_id) {
      const option = await this.optionRepository.findOne({
        where: {
          option_id: createDto.selected_option_id,
        },

        relations: ['question'],
      });

      if (!option) {
        throw new NotFoundException('Question option not found');
      }

      if (option.question.question_id !== formQuestion.question.question_id) {
        throw new NotFoundException(
          'Selected option does not belong to this question',
        );
      }

      selectedOption = option;
    }

    let percentage = createDto.answered_percentage ?? 0;

    let autoZero = false;

    // ======================================
    // ABSENT USER AUTO ZERO LOGIC
    // ======================================

    if (
      review.attendance &&
      review.attendance.attendance_status.toUpperCase() === 'ABSENT'
    ) {
      percentage = 0;

      autoZero = true;
    }

    const answer = this.answerRepository.create({
      review,

      formQuestion,

      selectedOption,

      answer_comment: createDto.answer_comment,

      answered_percentage: percentage,

      is_absent_auto_zero: autoZero,
    });

    return await this.answerRepository.save(answer);
  }

  // ==========================================
  // FIND ALL
  // ==========================================

  async findAll() {
    return await this.answerRepository.find({
      relations: [
        'review',

        'review.attendance',

        'formQuestion',

        'formQuestion.question',

        'selectedOption',
      ],
    });
  }

  // ==========================================
  // FIND ONE
  // ==========================================

  async findOne(id: string) {
    const answer = await this.answerRepository.findOne({
      where: {
        answer_id: id,
      },

      relations: [
        'review',

        'review.attendance',

        'formQuestion',

        'formQuestion.question',

        'selectedOption',
      ],
    });

    if (!answer) {
      throw new NotFoundException('Performance review answer not found');
    }

    return answer;
  }

  // ==========================================
  // UPDATE
  // ==========================================

  async update(id: string, updateDto: UpdatePerformanceReviewAnswerDto) {
    const answer = await this.findOne(id);

    if (
      answer.review.attendance &&
      answer.review.attendance.attendance_status.toUpperCase() === 'ABSENT'
    ) {
      answer.answered_percentage = 0;

      answer.is_absent_auto_zero = true;

      return await this.answerRepository.save(answer);
    }

    if (updateDto.answer_comment !== undefined) {
      answer.answer_comment = updateDto.answer_comment;
    }

    if (updateDto.answered_percentage !== undefined) {
      answer.answered_percentage = updateDto.answered_percentage;
    }

    if (updateDto.is_absent_auto_zero !== undefined) {
      answer.is_absent_auto_zero = updateDto.is_absent_auto_zero;
    }

    return await this.answerRepository.save(answer);
  }

  // ==========================================
  // DELETE
  // ==========================================

  async remove(id: string) {
    const answer = await this.findOne(id);

    await this.answerRepository.remove(answer);

    return {
      message: 'Performance Review Answer deleted successfully',
    };
  }
}
