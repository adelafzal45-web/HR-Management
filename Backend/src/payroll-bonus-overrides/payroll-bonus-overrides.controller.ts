import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { PayrollBonusOverridesService } from './payroll-bonus-overrides.service';
import { UpsertPayrollBonusOverrideDto } from './dto/upsert-payroll-bonus-override.dto';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/auth.constants';

/**
 * Manual bonus overrides for a payroll run.
 *
 * Reuses the payroll-run permissions: reading overrides needs `payroll.preview`
 * (the key the Run Payroll grid preview already uses) and writing/removing them
 * needs `payroll.process` (the key that runs the period). No new permission
 * keys, so no seed migration and no role-grant coordination.
 */
@ApiTags('Payroll Bonus Overrides')
@ApiBearerAuth()
@Controller('payroll-bonus-overrides')
export class PayrollBonusOverridesController {
  constructor(
    private readonly bonusOverridesService: PayrollBonusOverridesService,
  ) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll.preview')
  @ApiOperation({ summary: 'List manual bonus overrides for a period' })
  @ApiQuery({
    name: 'periodId',
    required: true,
    description: 'Payroll period UUID',
  })
  @ApiResponse({ status: 200, description: 'Overrides for the period.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll.preview permission.',
  })
  list(@Query('periodId') periodId: string) {
    return this.bonusOverridesService.list(periodId);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll.process')
  @ApiOperation({
    summary: "Create or update an employee's manual bonus for a period",
    description:
      'Upserts on (user_id, period_id). The engine honors this amount with precedence over the configured bonus rule; an amount of 0 cancels the bonus for that employee this run.',
  })
  @ApiBody({ type: UpsertPayrollBonusOverrideDto })
  @ApiResponse({ status: 201, description: 'Override saved.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll.process permission.',
  })
  upsert(
    @Body() dto: UpsertPayrollBonusOverrideDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.bonusOverridesService.upsert(dto, {
      user_id: user.user_id,
      email: user.email,
    });
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll.process')
  @ApiOperation({
    summary: 'Remove a manual bonus override',
    description:
      'Deletes the override so the employee reverts to the configured bonus rule for this run.',
  })
  @ApiParam({ name: 'id', description: 'Bonus override UUID' })
  @ApiResponse({ status: 200, description: 'Override removed.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll.process permission.',
  })
  @ApiResponse({ status: 404, description: 'Override not found.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.bonusOverridesService.remove(id);
  }
}
