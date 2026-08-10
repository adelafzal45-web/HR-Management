import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile as UploadedFileParam,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiConsumes,
  ApiParam,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

import {
  CompanySettingsService,
  COMPANY_ASSET_KINDS,
  type CompanyAssetKind,
} from './company-settings.service';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';
import {
  ALLOWED_BRANDING_MIME_TYPES,
  MAX_BRANDING_BYTES,
  type UploadedFile,
} from '../common/upload/image-upload';
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
  // CERTIFICATE SIGNATORIES
  // ==========================================

  /**
   * Who signs a certificate, for the client that renders one.
   *
   * Guarded by `employees.documents.view` — the permission that already gates
   * generating a certificate — rather than `company-settings.view`, which only
   * HR admins hold. Kept off the public branding payload so a signature image
   * is not readable without a token.
   */
  @Get('signatories')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.documents.view')
  @ApiOperation({
    summary: 'Get certificate signatories',
    description:
      'Returns the CEO and Co-Founder names and signature image paths used on generated certificates. Any field may be absent — a certificate with none configured still generates.',
  })
  @ApiResponse({ status: 200, description: 'Signatories retrieved.' })
  @ApiResponse({
    status: 403,
    description: 'User does not have employees.documents.view permission.',
  })
  @ApiResponse({
    status: 404,
    description: 'Company settings row not found (run migrations).',
  })
  getSignatories() {
    return this.companySettingsService.getSignatories();
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

  // ==========================================
  // IMAGE UPLOAD
  // ==========================================

  /**
   * Upload a logo, favicon or signature image.
   *
   * One route for all five rather than one per screen: they differ only in
   * which column the resulting path lands in, and the validation, storage and
   * replaced-file cleanup are identical.
   *
   * Separate from the PATCH so the file is validated and written before the
   * settings row points at it, and so the JSON contract stays JSON. The stored
   * path is saved immediately, and any image it replaces is removed.
   *
   * Guarded by `company-settings.update` — the same permission that can already
   * change the company logo and name by pasting a URL.
   */
  @Post('asset/:kind')
  @UseGuards(PermissionGuard)
  @RequirePermission('company-settings.update')
  @UseInterceptors(
    // The interceptor's cap has to cover the largest of the five; the exact
    // per-kind limit is enforced by `validateUpload` once the mimetype is
    // known. Both are needed: this one stops an oversized body being buffered
    // at all, that one gives the caller a precise reason.
    FileInterceptor('file', { limits: { fileSize: MAX_BRANDING_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a branding or signature image',
    description: `Stores the image and points the matching settings column at it, returning { url }. Logos and favicons accept ${ALLOWED_BRANDING_MIME_TYPES.join(', ')} up to ${MAX_BRANDING_BYTES / (1024 * 1024)} MB; signatures accept images only, up to 1 MB, and reproduce best as a transparent PNG. Contents are checked against the declared type.`,
  })
  @ApiParam({
    name: 'kind',
    enum: COMPANY_ASSET_KINDS,
    description: 'Which image is being replaced.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Stored. Returns { url }.' })
  @ApiResponse({
    status: 400,
    description: 'Unknown kind, or an invalid / oversized image.',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have company-settings.update permission.',
  })
  uploadAsset(
    @Param('kind') kind: string,
    @UploadedFileParam() file: UploadedFile | undefined,
  ) {
    // Validated here rather than by a DTO: a path parameter carries no body for
    // the ValidationPipe to check, and an unrecognised kind would otherwise
    // index the asset map with undefined and destructure null.
    if (!COMPANY_ASSET_KINDS.includes(kind as CompanyAssetKind)) {
      throw new BadRequestException(
        `Unknown image '${kind}'. Expected one of: ${COMPANY_ASSET_KINDS.join(', ')}.`,
      );
    }

    return this.companySettingsService.saveAsset(kind as CompanyAssetKind, file);
  }
}
