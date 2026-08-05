import {
  Body,
  Controller,
  Delete,
  Get,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';

import { WorkingDaySchedulesService } from './working-day-schedules.service';
import { SetWorkingDaysDto } from './dto/set-working-days.dto';
import { WorkingDaysQueryDto } from './dto/working-days-query.dto';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Working Day Schedules')
@Controller('working-days')
export class WorkingDaySchedulesController {
  constructor(private readonly service: WorkingDaySchedulesService) {}

  // ==========================================
  // LIST EVERY CONFIGURED SCOPE
  // ==========================================

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('working-days.view')
  @ApiOperation({
    summary: 'List every configured working-day row',
    description:
      'Returns rows across all scopes (global, per-department, per-designation) without applying fallback.',
  })
  @ApiResponse({ status: 200, description: 'Rows retrieved successfully.' })
  @ApiResponse({
    status: 403,
    description: 'Missing working-days.view permission.',
  })
  findAll() {
    return this.service.findAll();
  }

  // ==========================================
  // READ ONE SCOPE (no fallback)
  // ==========================================

  @Get('scope')
  @UseGuards(PermissionGuard)
  @RequirePermission('working-days.view')
  @ApiOperation({
    summary: 'Read one scope exactly as configured',
    description:
      'No fallback applied — an empty array means this scope has no override and inherits.',
  })
  @ApiQuery({ name: 'department_id', required: false })
  @ApiQuery({ name: 'designation_id', required: false })
  @ApiResponse({ status: 200, description: 'Scope retrieved successfully.' })
  @ApiResponse({
    status: 400,
    description: 'designation_id sent without department_id.',
  })
  @ApiResponse({
    status: 403,
    description: 'Missing working-days.view permission.',
  })
  findScope(@Query() query: WorkingDaysQueryDto) {
    return this.service.findScope(query);
  }

  // ==========================================
  // RESOLVE EFFECTIVE WEEK (fallback applied)
  // ==========================================

  @Get('resolve')
  @UseGuards(PermissionGuard)
  @RequirePermission('working-days.view')
  @ApiOperation({
    summary: 'Resolve the effective week for a scope',
    description:
      'Applies the specificity ladder designation -> department -> global, and reports which tier won. Days not marked working come back false.',
  })
  @ApiQuery({ name: 'department_id', required: false })
  @ApiQuery({ name: 'designation_id', required: false })
  @ApiResponse({ status: 200, description: 'Effective week resolved.' })
  @ApiResponse({
    status: 400,
    description: 'designation_id sent without department_id.',
  })
  @ApiResponse({
    status: 403,
    description: 'Missing working-days.view permission.',
  })
  resolve(@Query() query: WorkingDaysQueryDto) {
    return this.service.resolveWeekForQuery(query);
  }

  // ==========================================
  // REPLACE A SCOPE'S WEEK
  // ==========================================

  @Put()
  @UseGuards(PermissionGuard)
  @RequirePermission('working-days.update')
  @ApiOperation({
    summary: "Replace a scope's working week",
    description:
      'Atomic whole-week replacement. Days omitted from the payload become non-working.',
  })
  @ApiResponse({ status: 200, description: 'Week saved successfully.' })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or invalid scope.',
  })
  @ApiResponse({
    status: 403,
    description: 'Missing working-days.update permission.',
  })
  setWeek(@Body() dto: SetWorkingDaysDto) {
    return this.service.setWeek(dto);
  }

  // ==========================================
  // CLEAR AN OVERRIDE
  // ==========================================

  @Delete()
  @UseGuards(PermissionGuard)
  @RequirePermission('working-days.update')
  @ApiOperation({
    summary: "Clear a scope's override so it inherits again",
    description: 'The global default cannot be cleared — update it instead.',
  })
  @ApiQuery({ name: 'department_id', required: false })
  @ApiQuery({ name: 'designation_id', required: false })
  @ApiResponse({ status: 200, description: 'Override cleared.' })
  @ApiResponse({
    status: 400,
    description: 'Attempted to clear the global default.',
  })
  @ApiResponse({
    status: 403,
    description: 'Missing working-days.update permission.',
  })
  clearScope(@Query() query: WorkingDaysQueryDto) {
    return this.service.clearScope(query);
  }
}
