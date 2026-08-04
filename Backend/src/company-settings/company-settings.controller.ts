import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';

import { CompanySettingsService } from './company-settings.service';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';
import { Public } from 'src/auth/decorators/public.decorator';

@ApiTags('Company Settings')
@Controller('company-settings')
export class CompanySettingsController {
  constructor(
    private readonly companySettingsService: CompanySettingsService,
  ) {}

  // ==========================================
  // GET COMPANY SETTINGS
  // ==========================================

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('company-settings.view')
  @ApiOperation({
    summary: 'Get company settings',
    description: 'Returns the single global company settings row (id=1).',
  })
  @ApiResponse({
    status: 200,
    description: 'Company settings retrieved successfully.',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have company-settings.view permission.',
  })
  @ApiResponse({
    status: 404,
    description: 'Company settings row not found (run migrations).',
  })
  get() {
    return this.companySettingsService.get();
  }

  // ==========================================
  // PUBLIC BRANDING
  // ==========================================

  @Get('branding')
  @Public()
  @ApiOperation({
    summary: 'Get public branding',
    description:
      'Returns the branding subset (display name, logos, favicon, primary color, contact details). Unauthenticated: the login screen renders the logo and the app themes itself from primary_color before any token exists.',
  })
  @ApiResponse({
    status: 200,
    description: 'Branding retrieved successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Company settings row not found (run migrations).',
  })
  getBranding() {
    return this.companySettingsService.getBranding();
  }

  // ==========================================
  // UPDATE COMPANY SETTINGS
  // ==========================================

  @Patch()
  @UseGuards(PermissionGuard)
  @RequirePermission('company-settings.update')
  @ApiOperation({
    summary: 'Update company settings',
    description:
      'Updates the single global company settings row (id=1). No path parameter — id is always 1 by design.',
  })
  @ApiBody({
    type: UpdateCompanySettingsDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Company settings updated successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed.',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have company-settings.update permission.',
  })
  @ApiResponse({
    status: 404,
    description: 'Company settings row not found (run migrations).',
  })
  update(@Body() dto: UpdateCompanySettingsDto) {
    return this.companySettingsService.update(dto);
  }
}
