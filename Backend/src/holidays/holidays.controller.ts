import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { HolidaysService } from './holidays.service';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';
import { HolidayQueryDto } from './dto/holiday-query.dto';

import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/auth.constants';

@ApiTags('Holidays')
@ApiBearerAuth()
@Controller('holidays')
@UseGuards(PermissionGuard)
export class HolidaysController {
  constructor(private readonly service: HolidaysService) {}

  @Post()
  @RequirePermission('holiday.manage')
  @ApiOperation({
    summary: 'Create a company or department holiday or event.',
    description:
      'Set `notify: true` to also send an in-app notification announcing it to every active employee.',
  })
  create(@Body() dto: CreateHolidayDto, @CurrentUser() user: JwtUser) {
    return this.service.create(dto, user.user_id);
  }

  @Get()
  @RequirePermission('holiday.view')
  @ApiOperation({ summary: 'List holidays, optionally filtered by year/department.' })
  findAll(@Query() query: HolidayQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermission('holiday.view')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('holiday.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateHolidayDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, dto, user.user_id);
  }

  @Delete(':id')
  @RequirePermission('holiday.manage')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
