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

  async create(createDto: CreateAppraisalQuestionDto) {
    const user = await this.userRepository.findOne({
      where: {
        user_id: createDto.user_id,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const question = this.appraisalQuestionRepository.create({
      question_text: createDto.question_text,
      question_type: createDto.question_type,
      weight: createDto.weight,
      is_active: createDto.is_active,
      user,
    });

    return await this.appraisalQuestionRepository.save(question);
  }

  async findAll() {
    return await this.appraisalQuestionRepository.find({
      relations: ['user', 'performanceReviews'],
    });
  }

  async findOne(id: string) {
    const question = await this.appraisalQuestionRepository.findOne({
      where: {
        question_id: id,
      },
      relations: ['user', 'performanceReviews'],
    });

    if (!question) {
      throw new NotFoundException('Appraisal Question not found');
    }

    return question;
  }

  async update(id: string, updateDto: UpdateAppraisalQuestionDto) {
    const question = await this.findOne(id);

    if (updateDto.user_id) {
      const user = await this.userRepository.findOne({
        where: {
          user_id: updateDto.user_id,
        },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      question.user = user;
    }

    Object.assign(question, updateDto);

    return await this.appraisalQuestionRepository.save(question);
  }

  async remove(id: string) {
    const question = await this.findOne(id);

    return await this.appraisalQuestionRepository.remove(question);
  }
}
