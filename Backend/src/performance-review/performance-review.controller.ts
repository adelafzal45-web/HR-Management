import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { PerformanceReviewService } from './performance-review.service';
import { CreatePerformanceReviewDto } from './dto/create-performance-review.dto';
import { UpdatePerformanceReviewDto } from './dto/update-performance-review.dto';

@ApiTags('Performance Reviews')
@Controller('performance-review')
export class PerformanceReviewController {
  constructor(
    private readonly performanceReviewService: PerformanceReviewService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create performance review',
    description: 'Creates a new performance review record for an employee',
  })
  @ApiResponse({
    status: 201,
    description: 'Performance review created successfully',
  })
  create(@Body() createPerformanceReviewDto: CreatePerformanceReviewDto) {
    return this.performanceReviewService.create(createPerformanceReviewDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all performance reviews',
    description: 'Returns all performance review records',
  })
  @ApiResponse({
    status: 200,
    description: 'Performance reviews fetched successfully',
  })
  findAll() {
    return this.performanceReviewService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get performance review by ID',
    description: 'Returns a single performance review using UUID',
  })
  @ApiParam({
    name: 'id',
    example: '8f9b8b2e-5a6a-4d9e-b4c1-123456789abc',
    description: 'Performance review UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Performance review found successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Performance review not found',
  })
  findOne(@Param('id') id: string) {
    return this.performanceReviewService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update performance review',
    description: 'Updates an existing performance review record',
  })
  @ApiParam({
    name: 'id',
    example: '8f9b8b2e-5a6a-4d9e-b4c1-123456789abc',
    description: 'Performance review UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Performance review updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Performance review not found',
  })
  update(
    @Param('id') id: string,
    @Body() updatePerformanceReviewDto: UpdatePerformanceReviewDto,
  ) {
    return this.performanceReviewService.update(id, updatePerformanceReviewDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete performance review',
    description: 'Deletes a performance review record by ID',
  })
  @ApiParam({
    name: 'id',
    example: '8f9b8b2e-5a6a-4d9e-b4c1-123456789abc',
    description: 'Performance review UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Performance review deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Performance review not found',
  })
  remove(@Param('id') id: string) {
    return this.performanceReviewService.remove(id);
  }
}
