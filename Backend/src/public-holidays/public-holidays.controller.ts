import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';

import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

import { PublicHolidaysService } from './public-holidays.service';

import { CreatePublicHolidayDto } from './dto/create-public-holidays.dto';
import { UpdatePublicHolidayDto } from './dto/update-public-holidays.dto';

@ApiTags('Public Holidays')
@Controller('public-holidays')
export class PublicHolidaysController {
  constructor(private readonly publicHolidaysService: PublicHolidaysService) {}

  /**
   * Create public holiday
   *
   * HR/Admin creates holiday
   *
   * Flow:
   * 1. Save public holiday
   * 2. Find all active users
   * 3. Create notification for every user
   */
  @Post()
  @ApiOperation({
    summary: 'Create a public holiday',
    description:
      'Creates a public holiday and sends notifications to all active users.',
  })
  @ApiResponse({
    status: 201,
    description: 'Public holiday created successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data.',
  })
  create(@Body() createPublicHolidayDto: CreatePublicHolidayDto) {
    return this.publicHolidaysService.create(createPublicHolidayDto);
  }

  /**
   * Get all public holidays
   */
  @Get()
  @ApiOperation({
    summary: 'Get all public holidays',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns all public holidays.',
  })
  findAll() {
    return this.publicHolidaysService.findAll();
  }

  /**
   * Get single public holiday
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get public holiday by ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Public Holiday UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Public holiday found.',
  })
  @ApiResponse({
    status: 404,
    description: 'Public holiday not found.',
  })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.publicHolidaysService.findOne(id);
  }

  /**
   * Update public holiday
   */
  @Patch(':id')
  @ApiOperation({
    summary: 'Update a public holiday',
  })
  @ApiParam({
    name: 'id',
    description: 'Public Holiday UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Public holiday updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Public holiday not found.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePublicHolidayDto: UpdatePublicHolidayDto,
  ) {
    return this.publicHolidaysService.update(id, updatePublicHolidayDto);
  }

  /**
   * Delete public holiday
   */
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a public holiday',
  })
  @ApiParam({
    name: 'id',
    description: 'Public Holiday UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Public holiday deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Public holiday not found.',
  })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.publicHolidaysService.remove(id);
  }
}
