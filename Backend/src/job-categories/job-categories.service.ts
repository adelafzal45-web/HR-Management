import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { JobCategory } from './job-category.entity';
import { CreateJobCategoryDto } from './dto/create-job-category.dto';
import { UpdateJobCategoryDto } from './dto/update-job-category.dto';

@Injectable()
export class JobCategoriesService {
  constructor(
    @InjectRepository(JobCategory)
    private readonly repository: Repository<JobCategory>,
  ) {}

  create(dto: CreateJobCategoryDto) {
    return this.repository.save(dto);
  }

  findAll() {
    return this.repository.find();
  }

  findOne(id: string) {
    return this.repository.findOneBy({
      job_category_id: id,
    });
  }

  async update(id: string, dto: UpdateJobCategoryDto) {
    await this.repository.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.repository.delete(id);

    return {
      message: 'Job Category deleted successfully.',
    };
  }
}