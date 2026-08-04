import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppraisalFormQuestion } from './appraisal-form-questions.entity';
import { AppraisalForms } from '../appraisal-forms/appraisal-forms.entity';
import { AppraisalQuestion } from '../appraisal-question/appraisal-question.entity';

import { CreateAppraisalFormQuestionDto } from './dto/create-appraisal-form-question.dto';
import { UpdateAppraisalFormQuestionDto } from './dto/update-appraisal-form-question.dto';

@Injectable()
export class AppraisalFormQuestionsService {
  constructor(
    @InjectRepository(AppraisalFormQuestion)
    private readonly formQuestionRepository: Repository<AppraisalFormQuestion>,

    @InjectRepository(AppraisalForms)
    private readonly appraisalFormRepository: Repository<AppraisalForms>,

    @InjectRepository(AppraisalQuestion)
    private readonly appraisalQuestionRepository: Repository<AppraisalQuestion>,
  ) {}

  async create(
    dto: CreateAppraisalFormQuestionDto,
  ): Promise<AppraisalFormQuestion> {
    const appraisalForm = await this.appraisalFormRepository.findOne({
      where: {
        form_id: dto.form_id,
      },
    });

    if (!appraisalForm) {
      throw new NotFoundException('Appraisal Form not found');
    }

    const question = await this.appraisalQuestionRepository.findOne({
      where: {
        question_id: dto.question_id,
      },
    });

    if (!question) {
      throw new NotFoundException('Appraisal Question not found');
    }

    const formQuestion = this.formQuestionRepository.create({
      appraisalForm,
      question,
      display_order: dto.display_order ?? 1,
      weight_percentage: dto.weight_percentage,
      is_required: dto.is_required ?? true,
    });

    return this.formQuestionRepository.save(formQuestion);
  }

  async findAll(): Promise<AppraisalFormQuestion[]> {
    return this.formQuestionRepository.find({
      relations: {
        appraisalForm: true,
        question: true,
      },
      order: {
        display_order: 'ASC',
      },
    });
  }

  async findOne(id: string): Promise<AppraisalFormQuestion> {
    const formQuestion = await this.formQuestionRepository.findOne({
      where: {
        form_question_id: id,
      },
      relations: {
        appraisalForm: true,
        question: true,
      },
    });

    if (!formQuestion) {
      throw new NotFoundException(
        `Appraisal Form Question with ID ${id} not found`,
      );
    }

    return formQuestion;
  }

  async update(
    id: string,
    dto: UpdateAppraisalFormQuestionDto,
  ): Promise<AppraisalFormQuestion> {
    const formQuestion = await this.findOne(id);

    if (dto.form_id) {
      const form = await this.appraisalFormRepository.findOne({
        where: {
          form_id: dto.form_id,
        },
      });

      if (!form) {
        throw new NotFoundException('Appraisal Form not found');
      }

      formQuestion.appraisalForm = form;
    }

    if (dto.question_id) {
      const question = await this.appraisalQuestionRepository.findOne({
        where: {
          question_id: dto.question_id,
        },
      });

      if (!question) {
        throw new NotFoundException('Appraisal Question not found');
      }

      formQuestion.question = question;
    }

    if (dto.display_order !== undefined) {
      formQuestion.display_order = dto.display_order;
    }

    if (dto.weight_percentage !== undefined) {
      formQuestion.weight_percentage = dto.weight_percentage;
    }

    if (dto.is_required !== undefined) {
      formQuestion.is_required = dto.is_required;
    }

    return this.formQuestionRepository.save(formQuestion);
  }

  async remove(id: string): Promise<{ message: string }> {
    const formQuestion = await this.findOne(id);

    await this.formQuestionRepository.remove(formQuestion);

    return {
      message: 'Appraisal Form Question deleted successfully.',
    };
  }
}
