import { Injectable, NotFoundException } from '@nestjs/common';
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

  // Throws rather than returning null: the controller returns this directly, so
  // a missing row was surfacing as `200 {}` instead of a 404.
  async findOne(id: string) {
    const jobCategory = await this.repository.findOneBy({
      job_category_id: id,
    });

    if (!jobCategory) {
      throw new NotFoundException(`Job category with id "${id}" not found.`);
    }

    return jobCategory;
  }

  async update(id: string, dto: UpdateJobCategoryDto) {
    // findOne first so updating a nonexistent id 404s instead of quietly
    // affecting zero rows and reporting success.
    await this.findOne(id);
    await this.repository.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.repository.delete(id);

    return {
      message: 'Job Category deleted successfully.',
    };
  }
}
