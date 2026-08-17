import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { EmployeeFieldSettingsService } from './employee-field-settings.service';
import { UpdateEmployeeFieldSettingsDto } from './dto/update-employee-field-settings.dto';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '../authorization/guards/permission.guard';

@ApiTags('Employee Field Settings')
@ApiBearerAuth()
@Controller('employee-field-settings')
export class EmployeeFieldSettingsController {
  constructor(private readonly service: EmployeeFieldSettingsService) {}

  // ==========================================
  // GET
  // ==========================================

  /**
   * Read the requiredness config.
   *
   * Authentication only — no special permission. The map drives the required
   * asterisk and client-side validation on the admin employee form AND on the
   * self-service profile-edit screen, so every signed-in employee must be able
   * to read it. It carries nothing sensitive: which fields are required is
   * already obvious from the form itself. Editing it is what's gated (PATCH).
   */
  @Get()
  @ApiOperation({
    summary: 'Get employee field requiredness settings',
    description:
      'Returns the effective { field_config } map (fieldKey -> required). Readable by any authenticated user because it drives both the admin form and self-service profile editing.',
  })
  @ApiResponse({ status: 200, description: 'Settings retrieved.' })
  @ApiResponse({
    status: 404,
    description: 'Settings row not found (run migrations).',
  })
  get() {
    return this.service.get();
  }

  // ==========================================
  // UPDATE
  // ==========================================

  @Patch()
  @UseGuards(PermissionGuard)
  @RequirePermission('employee-fields.manage')
  @ApiOperation({
    summary: 'Update employee field requiredness settings',
    description:
      'Partial merge of the single settings row (id=1). Send only the fieldKey -> boolean toggles you are changing; unknown keys and non-boolean values are rejected.',
  })
  @ApiBody({ type: UpdateEmployeeFieldSettingsDto })
  @ApiResponse({ status: 200, description: 'Settings updated.' })
  @ApiResponse({
    status: 400,
    description: 'Unknown field key or non-boolean value.',
  })
  @ApiResponse({
    status: 403,
    description: 'Missing employee-fields.manage permission.',
  })
  @ApiResponse({
    status: 404,
    description: 'Settings row not found (run migrations).',
  })
  update(@Body() dto: UpdateEmployeeFieldSettingsDto) {
    return this.service.update(dto);
  }
}
