import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { PayslipsService } from './payslips.service';
import { PreviewPayslipDto } from './dto/preview-payslip.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/auth.constants';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

/**
 * Payslip reads + preview (spec §14).
 *
 * The `preview`, `me`, `me/:id`, `report`, and `export` routes are declared
 * before the parametric `:id` so Nest's in-order matcher does not read them as a
 * payslip id. The two `me` routes carry no `@RequirePermission` — like
 * `/attendance/me` they are hard-scoped to the caller's own `user_id` from the
 * verified JWT.
 */
@ApiTags('Payslips')
@Controller('payslips')
export class PayslipsController {
  constructor(private readonly payslipsService: PayslipsService) {}

  @Post('preview')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll.preview')
  @ApiOperation({
    summary: 'Preview a payslip without saving it',
    description:
      'Runs the calculation engine for one employee/period and returns the full breakdown with a per-line "Why?" note.',
  })
  @ApiBody({ type: PreviewPayslipDto })
  @ApiResponse({ status: 201, description: 'Computed payslip breakdown.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll.preview permission.',
  })
  @ApiResponse({ status: 404, description: 'Employee or period not found.' })
  preview(@Body() dto: PreviewPayslipDto) {
    return this.payslipsService.preview(dto);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Own payslips for the signed-in employee (self-service)',
  })
  @ApiQuery({ name: 'periodId', required: false })
  @ApiResponse({ status: 200, description: 'Own payslips retrieved.' })
  @ApiResponse({
    status: 403,
    description: 'Self-service is disabled in payroll settings.',
  })
  findMine(@CurrentUser() user: JwtUser, @Query('periodId') periodId?: string) {
    return this.payslipsService.findMine(user.user_id, periodId);
  }

  @Get('me/:id')
  @ApiOperation({ summary: 'One own payslip by id (self-service)' })
  @ApiParam({ name: 'id', description: 'Payslip UUID' })
  @ApiResponse({ status: 200, description: 'Own payslip retrieved.' })
  @ApiResponse({ status: 404, description: 'Payslip not found for this user.' })
  findMineOne(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payslipsService.findMineOne(user.user_id, id);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('payslips.view')
  @ApiOperation({
    summary: 'List payslips (org-wide)',
    description: 'Optionally filter by periodId and/or userId.',
  })
  @ApiQuery({ name: 'periodId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiResponse({ status: 200, description: 'Payslips retrieved.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payslips.view permission.',
  })
  findAll(
    @Query('periodId') periodId?: string,
    @Query('userId') userId?: string,
  ) {
    return this.payslipsService.findAll({ periodId, userId });
  }

  @Get('report')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-reports.view')
  @ApiOperation({
    summary: 'Payroll register for a period',
    description:
      'Aggregates persisted payslips for a period into a per-employee register plus company-wide gross/net/tax/loan totals and per-line component roll-ups. Read-only — never recalculates.',
  })
  @ApiQuery({ name: 'periodId', required: true, description: 'Period UUID' })
  @ApiResponse({ status: 200, description: 'Report retrieved.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-reports.view permission.',
  })
  report(@Query('periodId', ParseUUIDPipe) periodId: string) {
    return this.payslipsService.report(periodId);
  }

  @Get('export')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-reports.view')
  @ApiOperation({
    summary: 'Download the period payroll register as an Excel workbook',
    description:
      'Returns a three-sheet .xlsx (Payroll Register, Component Totals, Summary) built from the same persisted payslips the report endpoint reads — nothing is recalculated at download time.',
  })
  @ApiQuery({ name: 'periodId', required: true, description: 'Period UUID' })
  @ApiResponse({ status: 200, description: 'Workbook streamed.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-reports.view permission.',
  })
  async exportWorkbook(
    @Query('periodId', ParseUUIDPipe) periodId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } =
      await this.payslipsService.exportWorkbook(periodId);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('payslips.view')
  @ApiOperation({ summary: 'Get a payslip by id (org-wide)' })
  @ApiParam({ name: 'id', description: 'Payslip UUID' })
  @ApiResponse({ status: 200, description: 'Payslip retrieved.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payslips.view permission.',
  })
  @ApiResponse({ status: 404, description: 'Payslip not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.payslipsService.findOne(id);
  }
}
