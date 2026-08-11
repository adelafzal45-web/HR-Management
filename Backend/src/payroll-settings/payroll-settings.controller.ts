import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';

import { PayrollSettingsService } from './payroll-settings.service';
import { UpdatePayrollSettingsDto } from './dto/update-payroll-settings.dto';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Payroll Settings')
@Controller('payroll-settings')
export class PayrollSettingsController {
  constructor(
    private readonly payrollSettingsService: PayrollSettingsService,
  ) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-settings.view')
  @ApiOperation({
    summary: 'Get payroll settings',
    description: 'Returns the single global payroll settings row (id=1).',
  })
  @ApiResponse({ status: 200, description: 'Payroll settings retrieved.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-settings.view permission.',
  })
  @ApiResponse({
    status: 404,
    description: 'Payroll settings row not found (run migrations).',
  })
  get() {
    return this.payrollSettingsService.get();
  }

  @Patch()
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-settings.update')
  @ApiOperation({
    summary: 'Update payroll settings',
    description:
      'Updates the single global payroll settings row (id=1). No path parameter — id is always 1 by design.',
  })
  @ApiBody({ type: UpdatePayrollSettingsDto })
  @ApiResponse({ status: 200, description: 'Payroll settings updated.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-settings.update permission.',
  })
  @ApiResponse({
    status: 404,
    description: 'Payroll settings row not found (run migrations).',
  })
  update(@Body() dto: UpdatePayrollSettingsDto) {
    return this.payrollSettingsService.update(dto);
  }
}
