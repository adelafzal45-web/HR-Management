import { Injectable, NotFoundException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppraisalForms } from './appraisal-forms.entity';

import { CreateAppraisalFormsDto } from './dto/create-appraisal-forms.dto';
import { UpdateAppraisalFormsDto } from './dto/update-appraisal-form.dto';

@Injectable()
export class AppraisalFormsService {
  constructor(
    @InjectRepository(AppraisalForms)
    private readonly appraisalFormsRepository: Repository<AppraisalForms>,
  ) {}

  async create(createDto: CreateAppraisalFormsDto) {
    const form = this.appraisalFormsRepository.create({
      ...createDto,
    });

    return await this.appraisalFormsRepository.save(form);
  }

  async findAll() {
    return await this.appraisalFormsRepository.find({
      relations: ['performanceReviews'],
    });
  }

  async findOne(id: string) {
    const form = await this.appraisalFormsRepository.findOne({
      where: {
        form_id: id,
      },

      relations: ['performanceReviews'],
    });

    if (!form) {
      throw new NotFoundException('Appraisal form not found');
    }

    return form;
  }

  async update(id: string, updateDto: UpdateAppraisalFormsDto) {
    const form = await this.findOne(id);

    Object.assign(form, updateDto);

    return await this.appraisalFormsRepository.save(form);
  }

  async remove(id: string) {
    const form = await this.findOne(id);

    await this.appraisalFormsRepository.remove(form);

    return {
      message: 'Appraisal form deleted successfully',
    };
  }
}
