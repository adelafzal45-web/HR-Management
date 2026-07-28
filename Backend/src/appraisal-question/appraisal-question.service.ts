import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppraisalQuestion } from './appraisal-question.entity';
import { User } from '../users/user.entity';

import { CreateAppraisalQuestionDto } from './dto/create-appraisal-question.dto';
import { UpdateAppraisalQuestionDto } from './dto/update-appraisal-question.dto';

@Injectable()
export class AppraisalQuestionService {
  constructor(
    @InjectRepository(AppraisalQuestion)
    private readonly appraisalQuestionRepository: Repository<AppraisalQuestion>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // ==========================================
  // CREATE APPRAISAL QUESTION
  // ==========================================

  async create(createDto: CreateAppraisalQuestionDto) {
    // Find the user who is creating the question
    const user = await this.userRepository.findOne({
      where: {
        user_id: createDto.user_id,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Create question
    const question = this.appraisalQuestionRepository.create({
      question_text: createDto.question_text,

      question_type: createDto.question_type,

      is_active: createDto.is_active ?? true,

      // User who created the question
      createdBy: user,

      // One-to-one weight
      weight: {
        weight_percentage: createDto.weight,
      },
    });

    /*
      Because AppraisalQuestion.weight has:

      cascade: true

      TypeORM will also create the
      AppraisalQuestionWeight record.
    */

    return await this.appraisalQuestionRepository.save(question);
  }

  // ==========================================
  // FIND ALL QUESTIONS
  // ==========================================

  async findAll() {
    return await this.appraisalQuestionRepository.find({
      relations: [
        'createdBy',
        'options',
        'weight',
        'performanceReviews',
      ],
    });
  }

  // ==========================================
  // FIND ONE QUESTION
  // ==========================================

  async findOne(id: string) {
    const question = await this.appraisalQuestionRepository.findOne({
      where: {
        question_id: id,
      },
      relations: [
        'createdBy',
        'options',
        'weight',
        'performanceReviews',
      ],
    });

    if (!question) {
      throw new NotFoundException(
        'Appraisal Question not found',
      );
    }

    return question;
  }

  // ==========================================
  // UPDATE QUESTION
  // ==========================================

  async update(
    id: string,
    updateDto: UpdateAppraisalQuestionDto,
  ) {
    const question = await this.findOne(id);

    // ------------------------------------------
    // Update question creator
    // ------------------------------------------

    if (updateDto.user_id !== undefined) {
      const user = await this.userRepository.findOne({
        where: {
          user_id: updateDto.user_id,
        },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      question.createdBy = user;
    }

    // ------------------------------------------
    // Update question text
    // ------------------------------------------

    if (updateDto.question_text !== undefined) {
      question.question_text = updateDto.question_text;
    }

    // ------------------------------------------
    // Update question type
    // ------------------------------------------

    if (updateDto.question_type !== undefined) {
      question.question_type = updateDto.question_type;
    }

    // ------------------------------------------
    // Update active status
    // ------------------------------------------

    if (updateDto.is_active !== undefined) {
      question.is_active = updateDto.is_active;
    }

    // ------------------------------------------
    // Update question weight
    // ------------------------------------------

    if (updateDto.weight !== undefined) {
      if (!question.weight) {
        throw new NotFoundException(
          'Weight record not found for this appraisal question',
        );
      }

      question.weight.weight_percentage = updateDto.weight;
    }

    return await this.appraisalQuestionRepository.save(question);
  }

  // ==========================================
  // DELETE QUESTION
  // ==========================================

  async remove(id: string) {
    const question = await this.findOne(id);

    await this.appraisalQuestionRepository.remove(question);

    return {
      message: 'Appraisal Question deleted successfully',
    };
  }
}