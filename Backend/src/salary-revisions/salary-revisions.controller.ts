import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { SalaryRevisionsService } from './salary-revisions.service';
import { CreateSalaryRevisionDto } from './dto/create-salary-revision.dto';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/auth.constants';
import type { AuditActor } from '../audit/audit.service';

/**
 * Salary revisions — increment/decrement an employee's base pay with history.
 *
 * Reuses the existing employee-salary permissions: reading history needs the
 * same `employees.salary.view` that reveals the salary field, and applying a
 * change needs the same `employees.salary.edit` that lets HR edit it. No new
 * permission keys, so no seed migration and no role-grant coordination.
 */
@ApiTags('Salary Revisions')
@ApiBearerAuth()
@Controller('salary-revisions')
export class SalaryRevisionsController {
  constructor(
    private readonly salaryRevisionsService: SalaryRevisionsService,
  ) {}

  /** Builds the audit actor from the token plus request metadata. */
  private actorFrom(user: JwtUser, request: Request): AuditActor {
    return {
      user_id: user.user_id,
      email: user.email,
      ip: request.ip,
      userAgent: request.get('user-agent') ?? undefined,
    };
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.salary.view')
  @ApiOperation({ summary: "List an employee's salary revision history" })
  @ApiQuery({ name: 'userId', required: true, description: 'Employee UUID' })
  @ApiResponse({ status: 200, description: 'Revisions (newest first).' })
  @ApiResponse({
    status: 403,
    description: 'Missing employees.salary.view permission.',
  })
  list(@Query('userId') userId: string) {
    return this.salaryRevisionsService.list(userId);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.salary.edit')
  @ApiOperation({
    summary: 'Apply a base-salary increment or decrement',
    description:
      'Updates users.salary, records an append-only revision, and audits the change. Returns the revision plus a warning when a salary-structure assignment would mask it.',
  })
  @ApiBody({ type: CreateSalaryRevisionDto })
  @ApiResponse({ status: 201, description: 'Revision applied.' })
  @ApiResponse({
    status: 400,
    description: 'Future effective date, or result below zero.',
  })
  @ApiResponse({
    status: 403,
    description: 'Missing employees.salary.edit permission.',
  })
  @ApiResponse({ status: 404, description: 'Employee not found.' })
  apply(
    @Body() dto: CreateSalaryRevisionDto,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    return this.salaryRevisionsService.apply(
      dto,
      this.actorFrom(user, request),
    );
  }
}
