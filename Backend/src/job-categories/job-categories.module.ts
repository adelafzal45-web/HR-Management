import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JobCategory } from './job-category.entity';
import { JobCategoriesController } from './job-categories.controller';
import { JobCategoriesService } from './job-categories.service';

@Module({
  imports: [TypeOrmModule.forFeature([JobCategory])],
  controllers: [JobCategoriesController],
  providers: [JobCategoriesService],
  exports: [JobCategoriesService, TypeOrmModule],
})
export class JobCategoriesModule {}
