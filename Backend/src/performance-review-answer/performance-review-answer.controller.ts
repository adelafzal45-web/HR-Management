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

import { PerformanceReviewAnswerService } from './performance-review-answer.service';

import { CreatePerformanceReviewAnswerDto } from './dto/create.dto';
import { UpdatePerformanceReviewAnswerDto } from './dto/update.dto';

@ApiTags('Performance Review Answers')
@Controller('performance-review-answers')
export class PerformanceReviewAnswerController {
  constructor(
    private readonly answerService: PerformanceReviewAnswerService,
  ) {}

  // ==========================================
  // CREATE
  // ==========================================

  @Post()
  @ApiOperation({
    summary: 'Create a performance review answer',
    description:
      'Adds an answer to a specific appraisal question within a performance review.',
  })
  @ApiBody({
    type: CreatePerformanceReviewAnswerDto,
  })
  @ApiResponse({
    status: 201,
    description:
      'Performance review answer created successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body.',
  })
  @ApiResponse({
    status: 404,
    description:
      'Performance review, appraisal question, or selected option not found.',
  })
  create(
    @Body()
    createDto: CreatePerformanceReviewAnswerDto,
  ) {
    return this.answerService.create(createDto);
  }

  // ==========================================
  // GET ALL
  // ==========================================

  @Get()
  @ApiOperation({
    summary: 'Get all performance review answers',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns all performance review answers.',
  })
  findAll() {
    return this.answerService.findAll();
  }

  // ==========================================
  // GET ONE
  // ==========================================

  @Get(':id')
  @ApiOperation({
    summary: 'Get a performance review answer by ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Performance review answer UUID',
    example:
      '8f52df59-6b08-42c2-94f6-7a5d34f3d1d5',
  })
  @ApiResponse({
    status: 200,
    description:
      'Performance review answer found.',
  })
  @ApiResponse({
    status: 404,
    description:
      'Performance review answer not found.',
  })
  findOne(@Param('id') id: string) {
    return this.answerService.findOne(id);
  }

  // ==========================================
  // UPDATE
  // ==========================================

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a performance review answer',
    description:
      'Partially updates an existing performance review answer.',
  })
  @ApiParam({
    name: 'id',
    description: 'Performance review answer UUID',
    example:
      '8f52df59-6b08-42c2-94f6-7a5d34f3d1d5',
  })
  @ApiBody({
    type: UpdatePerformanceReviewAnswerDto,
  })
  @ApiResponse({
    status: 200,
    description:
      'Performance review answer updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description:
      'Performance review answer not found.',
  })
  update(
    @Param('id') id: string,
    @Body()
    updateDto: UpdatePerformanceReviewAnswerDto,
  ) {
    return this.answerService.update(
      id,
      updateDto,
    );
  }

  // ==========================================
  // DELETE
  // ==========================================

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a performance review answer',
  })
  @ApiParam({
    name: 'id',
    description: 'Performance review answer UUID',
    example:
      '8f52df59-6b08-42c2-94f6-7a5d34f3d1d5',
  })
  @ApiResponse({
    status: 200,
    description:
      'Performance review answer deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description:
      'Performance review answer not found.',
  })
  remove(@Param('id') id: string) {
    return this.answerService.remove(id);
  }
}
