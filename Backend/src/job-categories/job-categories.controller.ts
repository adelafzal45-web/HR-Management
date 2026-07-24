import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JobCategoriesService } from './job-categories.service';

import { CreateJobCategoryDto } from './dto/create-job-category.dto';
import { UpdateJobCategoryDto } from './dto/update-job-category.dto';

@ApiTags('Job Categories')
@Controller('job-categories')
export class JobCategoriesController {
  constructor(private readonly jobCategoryService: JobCategoriesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create Job Category',
  })
  @ApiBody({
    type: CreateJobCategoryDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Job Category created successfully.',
  })
  create(@Body() dto: CreateJobCategoryDto) {
    return this.jobCategoryService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all Job Categories',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns all Job Categories.',
  })
  findAll() {
    return this.jobCategoryService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get Job Category by ID',
  })
  @ApiParam({
    name: 'id',
    example: '8a57f84d-5baf-4db6-9d79-8175b3a2f113',
  })
  findOne(@Param('id') id: string) {
    return this.jobCategoryService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update Job Category',
  })
  @ApiParam({
    name: 'id',
  })
  @ApiBody({
    type: UpdateJobCategoryDto,
  })
  update(@Param('id') id: string, @Body() dto: UpdateJobCategoryDto) {
    return this.jobCategoryService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete Job Category',
  })
  @ApiParam({
    name: 'id',
  })
  remove(@Param('id') id: string) {
    return this.jobCategoryService.remove(id);
  }
}
