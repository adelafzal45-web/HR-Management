import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { AppraisalQuestionWeight } from './apprisal-question-weight.entity';

import { AppraisalQuestion } from '../appraisal-question/appraisal-question.entity';

import { CreateAppraisalQuestionWeightDto } from './dto/create.dto';

import { UpdateAppraisalQuestionWeightDto } from './dto/update.dto';

@Injectable()
export class AppraisalQuestionWeightsService {
  constructor(
    @InjectRepository(AppraisalQuestionWeight)
    private readonly weightRepository: Repository<AppraisalQuestionWeight>,

    @InjectRepository(AppraisalQuestion)
    private readonly questionRepository: Repository<AppraisalQuestion>,
  ) {}

  // CREATE
  async create(
    dto: CreateAppraisalQuestionWeightDto,
  ) {
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

    // A question can have only one weight
    const existingWeight =
      await this.weightRepository.findOne({
        where: {
          question: {
            question_id: dto.questionId,
          },
        },
      });

    if (existingWeight) {
      throw new ConflictException(
        'This appraisal question already has a weight',
      );
    }

    const weight = this.weightRepository.create({
      question,
      weight_percentage: dto.weight_percentage,
    });

    return this.weightRepository.save(weight);
  }

  // GET ALL
  findAll() {
    return this.weightRepository.find({
      relations: ['question'],
    });
  }

  // GET ONE
  async findOne(id: string) {
    const weight = await this.weightRepository.findOne({
      where: {
        weight_id: id,
      },
      relations: ['question'],
    });

    if (!weight) {
      throw new NotFoundException(
        'Appraisal question weight not found',
      );
    }

    return weight;
  }

  // UPDATE
  async update(
    id: string,
    dto: UpdateAppraisalQuestionWeightDto,
  ) {
    const weight = await this.weightRepository.findOne({
      where: {
        weight_id: id,
      },
    });

    if (!weight) {
      throw new NotFoundException(
        'Appraisal question weight not found',
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

      const existingWeight =
        await this.weightRepository.findOne({
          where: {
            question: {
              question_id: dto.questionId,
            },
          },
        });

      if (
        existingWeight &&
        existingWeight.weight_id !== id
      ) {
        throw new ConflictException(
          'This appraisal question already has a weight',
        );
      }

      weight.question = question;
    }

    if (dto.weight_percentage !== undefined) {
      weight.weight_percentage =
        dto.weight_percentage;
    }

    return this.weightRepository.save(weight);
  }

  // DELETE
  async remove(id: string) {
    const weight = await this.weightRepository.findOne({
      where: {
        weight_id: id,
      },
    });

    if (!weight) {
      throw new NotFoundException(
        'Appraisal question weight not found',
      );
    }

    await this.weightRepository.remove(weight);

    return {
      message:
        'Appraisal question weight deleted successfully',
    };
  }
}