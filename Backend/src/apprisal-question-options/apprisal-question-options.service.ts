import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { AppraisalQuestionOption } from './apprisal-question-options.entity';

import { AppraisalQuestion } from '../appraisal-question/appraisal-question.entity';

import { CreateAppraisalQuestionOptionDto } from './dto/create.dto';

import { UpdateAppraisalQuestionOptionDto } from './dto/update.dto';

@Injectable()
export class AppraisalQuestionOptionsService {
  constructor(
    @InjectRepository(AppraisalQuestionOption)
    private readonly optionRepository: Repository<AppraisalQuestionOption>,

    @InjectRepository(AppraisalQuestion)
    private readonly questionRepository: Repository<AppraisalQuestion>,
  ) {}

  // CREATE
  async create(dto: CreateAppraisalQuestionOptionDto) {
    const question = await this.questionRepository.findOne({
      where: {
        question_id: dto.questionId,
      },
    });

    if (!question) {
      throw new NotFoundException(
        'Appraisal question not found',
      );
    }

    const option = this.optionRepository.create({
      question,
      option_text: dto.option_text,
      score: dto.score,
      display_order: dto.display_order,
    });

    return this.optionRepository.save(option);
  }

  // GET ALL
  findAll() {
    return this.optionRepository.find({
      relations: ['question'],
      order: {
        display_order: 'ASC',
      },
    });
  }

  // GET ONE
  async findOne(id: string) {
    const option = await this.optionRepository.findOne({
      where: {
        option_id: id,
      },
      relations: ['question'],
    });

    if (!option) {
      throw new NotFoundException(
        'Appraisal question option not found',
      );
    }

    return option;
  }

  // UPDATE
  async update(
    id: string,
    dto: UpdateAppraisalQuestionOptionDto,
  ) {
    const option = await this.optionRepository.findOne({
      where: {
        option_id: id,
      },
    });

    if (!option) {
      throw new NotFoundException(
        'Appraisal question option not found',
      );
    }

    if (dto.questionId) {
      const question = await this.questionRepository.findOne({
        where: {
          question_id: dto.questionId,
        },
      });

      if (!question) {
        throw new NotFoundException(
          'Appraisal question not found',
        );
      }

      option.question = question;
    }

    if (dto.option_text !== undefined) {
      option.option_text = dto.option_text;
    }

    if (dto.score !== undefined) {
      option.score = dto.score;
    }

    if (dto.display_order !== undefined) {
      option.display_order = dto.display_order;
    }

    return this.optionRepository.save(option);
  }

  // DELETE
  async remove(id: string) {
    const option = await this.optionRepository.findOne({
      where: {
        option_id: id,
      },
    });

    if (!option) {
      throw new NotFoundException(
        'Appraisal question option not found',
      );
    }

    await this.optionRepository.remove(option);

    return {
      message: 'Appraisal question option deleted successfully',
    };
  }
}