import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
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

import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Performance Review Answers')
@Controller('performance-review-answers')
export class PerformanceReviewAnswerController {
  constructor(private readonly answerService: PerformanceReviewAnswerService) {}

  // ==========================================
  // CREATE
  // ==========================================

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.create')
  @ApiOperation({
    summary: 'Create Performance Review Answer',
    description: 'Adds an answer against an Appraisal Form Question.',
  })
  @ApiBody({
    type: CreatePerformanceReviewAnswerDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Performance Review Answer created successfully.',
  })
  create(@Body() createDto: CreatePerformanceReviewAnswerDto) {
    return this.answerService.create(createDto);
  }

  // ==========================================
  // GET ALL
  // ==========================================

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.view')
  @ApiOperation({
    summary: 'Get All Performance Review Answers',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns all Performance Review Answers.',
  })
  findAll() {
    return this.answerService.findAll();
  }

  // ==========================================
  // GET ONE
  // ==========================================

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.view')
  @ApiOperation({
    summary: 'Get Performance Review Answer',
  })
  @ApiParam({
    name: 'id',
    description: 'Performance Review Answer UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Performance Review Answer found.',
  })
  @ApiResponse({
    status: 404,
    description: 'Performance Review Answer not found.',
  })
  findOne(@Param('id') id: string) {
    return this.answerService.findOne(id);
  }

  // ==========================================
  // UPDATE
  // ==========================================

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.update')
  @ApiOperation({
    summary: 'Update Performance Review Answer',
  })
  @ApiParam({
    name: 'id',
    description: 'Performance Review Answer UUID',
  })
  @ApiBody({
    type: UpdatePerformanceReviewAnswerDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Performance Review Answer updated successfully.',
  })
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdatePerformanceReviewAnswerDto,
  ) {
    return this.answerService.update(id, updateDto);
  }

  // ==========================================
  // DELETE
  // ==========================================

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.delete')
  @ApiOperation({
    summary: 'Delete Performance Review Answer',
  })
  @ApiParam({
    name: 'id',
    description: 'Performance Review Answer UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Performance Review Answer deleted successfully.',
  })
  remove(@Param('id') id: string) {
    return this.answerService.remove(id);
  }
}
