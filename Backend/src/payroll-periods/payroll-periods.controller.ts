import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

import { PayrollPeriodsService } from './payroll-periods.service';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto';
import { UpdatePayrollPeriodDto } from './dto/update-payroll-period.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/auth.constants';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

/**
 * Payroll periods and the run workflow (spec §1). Ordinary CRUD is gated by
 * `payroll-periods.*`; the state transitions carry their own verbs —
 * `payroll.process` (HR runs it), `payroll.approve` (Administrator only), and
 * `payroll.lock`.
 */
@ApiTags('Payroll Periods')
@Controller('payroll-periods')
export class PayrollPeriodsController {
  constructor(private readonly periodsService: PayrollPeriodsService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-periods.create')
  @ApiOperation({ summary: 'Create a payroll period' })
  @ApiBody({ type: CreatePayrollPeriodDto })
  @ApiResponse({ status: 201, description: 'Period created (draft).' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-periods.create permission.',
  })
  create(@Body() dto: CreatePayrollPeriodDto) {
    return this.periodsService.create(dto);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-periods.view')
  @ApiOperation({ summary: 'List payroll periods (newest first)' })
  @ApiResponse({ status: 200, description: 'Periods retrieved.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-periods.view permission.',
  })
  findAll() {
    return this.periodsService.findAll();
  }

  @Get('setup-status')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-periods.view')
  @ApiOperation({
    summary: 'Payroll setup readiness (the "Activate Payroll" checklist)',
    description:
      'Reports whether required setup (settings row, an active component, an active structure assignment) is in place. Processing is hard-gated on this being ready.',
  })
  @ApiResponse({ status: 200, description: 'Setup status retrieved.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-periods.view permission.',
  })
  setupStatus() {
    return this.periodsService.getSetupStatus();
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-periods.view')
  @ApiOperation({ summary: 'Get a payroll period by id' })
  @ApiParam({ name: 'id', description: 'Period UUID' })
  @ApiResponse({ status: 200, description: 'Period retrieved.' })
  @ApiResponse({ status: 404, description: 'Period not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.periodsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-periods.update')
  @ApiOperation({
    summary: 'Update a draft payroll period',
    description: 'Allowed only while the period is still draft.',
  })
  @ApiParam({ name: 'id', description: 'Period UUID' })
  @ApiBody({ type: UpdatePayrollPeriodDto })
  @ApiResponse({ status: 200, description: 'Period updated.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 404, description: 'Period not found.' })
  @ApiResponse({ status: 409, description: 'Period is not a draft.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayrollPeriodDto,
  ) {
    return this.periodsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-periods.delete')
  @ApiOperation({
    summary: 'Delete a draft payroll period',
    description: 'Allowed only while the period is still draft.',
  })
  @ApiParam({ name: 'id', description: 'Period UUID' })
  @ApiResponse({ status: 200, description: 'Period deleted.' })
  @ApiResponse({ status: 404, description: 'Period not found.' })
  @ApiResponse({ status: 409, description: 'Period is not a draft.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.periodsService.remove(id);
  }

  // ---- Workflow transitions ------------------------------------------------

  @Post(':id/process')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll.process')
  @ApiOperation({
    summary: 'Process a period — generate payslips for every active employee',
    description:
      'Advances the period to pending_approval (when approval is enabled) or approved. Re-runnable until locked.',
  })
  @ApiParam({ name: 'id', description: 'Period UUID' })
  @ApiResponse({ status: 201, description: 'Run summary + updated period.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll.process permission.',
  })
  @ApiResponse({ status: 409, description: 'Period cannot be processed.' })
  process(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.periodsService.process(id, user.user_id);
  }

  @Post(':id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll.approve')
  @ApiOperation({
    summary: 'Approve a processed run (Administrator only)',
    description:
      'Requires approval to be enabled in payroll settings. Moves pending_approval → approved.',
  })
  @ApiParam({ name: 'id', description: 'Period UUID' })
  @ApiResponse({ status: 201, description: 'Period approved.' })
  @ApiResponse({
    status: 400,
    description: 'Approval is disabled in settings.',
  })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll.approve permission.',
  })
  @ApiResponse({ status: 409, description: 'Period is not pending approval.' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.periodsService.approve(id, user.user_id);
  }

  @Post(':id/lock')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll.lock')
  @ApiOperation({
    summary: 'Lock an approved period and freeze its payslips',
  })
  @ApiParam({ name: 'id', description: 'Period UUID' })
  @ApiResponse({ status: 201, description: 'Period locked.' })
  @ApiResponse({ status: 400, description: 'Locking is disabled in settings.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll.lock permission.',
  })
  @ApiResponse({ status: 409, description: 'Period is not approved.' })
  lock(@Param('id', ParseUUIDPipe) id: string) {
    return this.periodsService.lock(id);
  }
}
