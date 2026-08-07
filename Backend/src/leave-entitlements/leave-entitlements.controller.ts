import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { LeaveEntitlementsService } from './leave-entitlements.service';
import { PreviewEntitlementDto } from './dto/preview-entitlement.dto';
import { CreateEntitlementDto } from './dto/create-entitlement.dto';
import { AdjustBalanceDto } from './dto/adjust-balance.dto';
import { EntitlementQueryDto } from './dto/entitlement-query.dto';
import { LeaveHistoryQueryDto } from './dto/leave-history-query.dto';
import { LeaveBalanceReportQueryDto } from './dto/leave-balance-report-query.dto';

import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/auth.constants';
import type { AuditActor } from '../audit/audit.service';

/**
 * Admin/HR "Leave Entitlement" module: preview a target group's current
 * balance before assigning, then create/increase/deduct entitlements in
 * bulk (single employee, list of employees, department, or designation,
 * with an exclude list). Also exposes the read-only entitlement and
 * leave-history ledgers used by the Reporting/Dashboard views.
 */
@ApiTags('Leave Entitlements')
@ApiBearerAuth()
@Controller('leave-entitlements')
@UseGuards(PermissionGuard)
export class LeaveEntitlementsController {
  constructor(private readonly service: LeaveEntitlementsService) {}

  private actorFrom(user: JwtUser, request: Request): AuditActor {
    return {
      user_id: user.user_id,
      email: user.email,
      ip: request.ip,
      userAgent: request.get('user-agent') ?? undefined,
    };
  }

  @Post('preview')
  @RequirePermission('leave-entitlement.view')
  @ApiOperation({
    summary:
      'Resolve a target group and show current balance/used/remaining before assigning an entitlement.',
  })
  preview(@Body() dto: PreviewEntitlementDto) {
    return this.service.preview(dto);
  }

  @Post()
  @RequirePermission('leave-entitlement.manage')
  @ApiOperation({
    summary:
      'Create or update a yearly leave entitlement for a single employee, multiple employees, a department, or a designation (with optional excludes). Supports set/increase/deduct.',
  })
  assign(
    @Body() dto: CreateEntitlementDto,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    return this.service.bulkAssign(dto, this.actorFrom(user, request));
  }

  @Patch(':id/adjust')
  @RequirePermission('leave-entitlement.manage')
  @ApiOperation({
    summary: 'Increase or deduct balance on a single existing entitlement.',
  })
  adjust(
    @Param('id') id: string,
    @Body() dto: AdjustBalanceDto,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    return this.service.adjust(id, dto, this.actorFrom(user, request));
  }

  @Get()
  @RequirePermission('leave-entitlement.view')
  @ApiOperation({ summary: 'List entitlements, filterable by year/employee/leave type/department/designation.' })
  findAll(@Query() query: EntitlementQueryDto) {
    return this.service.findAll(query);
  }

  @Get('balances')
  @RequirePermission('leave-entitlement.view')
  @ApiOperation({
    summary:
      'Employee Leave Management report: one row per (employee, leave type) with entitlement/used/remaining/pending, filterable by department/leave type/employee/status and sortable by employee/department/leave type/remaining/status.',
  })
  findBalanceReport(@Query() query: LeaveBalanceReportQueryDto) {
    return this.service.findBalanceReport(query);
  }

  @Get('history')
  @RequirePermission('leave-history.view')
  @ApiOperation({
    summary:
      'Leave history ledger: Entitlement, Adjustment, Leave Taken, Carry Forward, Expiry entries.',
  })
  findHistory(@Query() query: LeaveHistoryQueryDto) {
    return this.service.findHistory(query);
  }
}
