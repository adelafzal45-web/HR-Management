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

import { PublicHolidaysService } from './public-holidays.service';

import { CreatePublicHolidayDto } from './dto/create-public-holidays.dto';
import { UpdatePublicHolidayDto } from './dto/update-public-holidays.dto';

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
  create(@Body() createPublicHolidayDto: CreatePublicHolidayDto) {
    return this.publicHolidaysService.create(createPublicHolidayDto);
  }

  /**
   * Get all public holidays
   */
  @Get()
  findAll() {
    return this.publicHolidaysService.findAll();
  }

  /**
   * Get single public holiday
   */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.publicHolidaysService.findOne(id);
  }

  /**
   * Update public holiday
   */
  @Patch(':id')
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
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.publicHolidaysService.remove(id);
  }
}
