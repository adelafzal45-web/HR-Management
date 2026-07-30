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

import { PerformanceReviewService } from './performance-review.service';

import { CreatePerformanceReviewDto } from './dto/create-performance-review.dto';
import { UpdatePerformanceReviewDto } from './dto/update-performance-review.dto';
import { UseGuards } from '@nestjs/common';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Performance Reviews')
@Controller('performance-reviews')
export class PerformanceReviewController {
  constructor(
    private readonly performanceReviewService: PerformanceReviewService,
  ) {}

  // =========================
  // CREATE
  // =========================

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.create')
  @ApiOperation({
    summary: 'Create a performance review',
    description:
      'Creates a performance review for an employee by another employee/reviewer.',
  })
  @ApiBody({
    type: CreatePerformanceReviewDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Performance review created successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body.',
  })
  @ApiResponse({
    status: 404,
    description: 'Reviewer or reviewee employee not found.',
  })
  create(@Body() createDto: CreatePerformanceReviewDto) {
    return this.performanceReviewService.create(createDto);
  }

  // =========================
  // GET ALL
  // =========================

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.view')
  @ApiOperation({
    summary: 'Get all performance reviews',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns all performance reviews.',
  })
  findAll() {
    return this.performanceReviewService.findAll();
  }

  // =========================
  // GET ONE
  // =========================

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.view')
  @ApiOperation({
    summary: 'Get a performance review by ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Performance review UUID',
    example: '8f52df59-6b08-42c2-94f6-7a5d34f3d1d5',
  })
  @ApiResponse({
    status: 200,
    description: 'Performance review found.',
  })
  @ApiResponse({
    status: 404,
    description: 'Performance review not found.',
  })
  findOne(@Param('id') id: string) {
    return this.performanceReviewService.findOne(id);
  }

  // =========================
  // UPDATE
  // =========================

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.update')
  @ApiOperation({
    summary: 'Update a performance review',
    description: 'Partially updates an existing performance review.',
  })
  @ApiParam({
    name: 'id',
    description: 'Performance review UUID',
    example: '8f52df59-6b08-42c2-94f6-7a5d34f3d1d5',
  })
  @ApiBody({
    type: UpdatePerformanceReviewDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Performance review updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Performance review not found.',
  })
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdatePerformanceReviewDto,
  ) {
    return this.performanceReviewService.update(id, updateDto);
  }

  // =========================
  // DELETE
  // =========================

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.delete')
  @ApiOperation({
    summary: 'Delete a performance review',
  })
  @ApiParam({
    name: 'id',
    description: 'Performance review UUID',
    example: '8f52df59-6b08-42c2-94f6-7a5d34f3d1d5',
  })
  @ApiResponse({
    status: 200,
    description: 'Performance review deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Performance review not found.',
  })
  remove(@Param('id') id: string) {
    return this.performanceReviewService.remove(id);
  }
}
