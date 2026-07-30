import { Injectable, NotFoundException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppraisalQuestion } from './appraisal-question.entity';

import { CreateAppraisalQuestionDto } from './dto/create-appraisal-question.dto';
import { UpdateAppraisalQuestionDto } from './dto/update-appraisal-question.dto';

@Injectable()
export class AppraisalQuestionService {
  constructor(
    @InjectRepository(AppraisalQuestion)
    private readonly appraisalQuestionRepository: Repository<AppraisalQuestion>,
  ) {}

  // ==========================================
  // CREATE
  // ==========================================

  async create(createDto: CreateAppraisalQuestionDto) {
    const question = this.appraisalQuestionRepository.create({
      question_text: createDto.question_text,
      question_type: createDto.question_type,
      is_active: createDto.is_active ?? true,
    });

    return await this.appraisalQuestionRepository.save(question);
  }

  // ==========================================
  // FIND ALL
  // ==========================================

  async findAll() {
    return await this.appraisalQuestionRepository.find({
      relations: ['options', 'formQuestions'],
    });
  }

  // ==========================================
  // FIND ONE
  // ==========================================

  async findOne(id: string) {
    const question = await this.appraisalQuestionRepository.findOne({
      where: {
        question_id: id,
      },
      relations: ['options', 'formQuestions'],
    });

    if (!question) {
      throw new NotFoundException('Appraisal Question not found');
    }

    return question;
  }

  // ==========================================
  // UPDATE
  // ==========================================

  async update(id: string, updateDto: UpdateAppraisalQuestionDto) {
    const question = await this.findOne(id);

    Object.assign(question, updateDto);

    return await this.appraisalQuestionRepository.save(question);
  }

  // ==========================================
  // DELETE
  // ==========================================

  async remove(id: string) {
    const question = await this.findOne(id);

    await this.appraisalQuestionRepository.remove(question);

    return {
      message: 'Appraisal Question deleted successfully',
    };
  }
}
