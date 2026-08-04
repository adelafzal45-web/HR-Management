import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { EmailTemplateService } from './email-template.service';
import {
  PreviewEmailTemplateDto,
  RestoreEmailTemplateVersionDto,
  UpdateEmailTemplateDto,
} from './dto/update-email-template.dto';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/auth.constants';
import { actorFrom } from '../common/audit/actor.util';

/**
 * Email template management.
 *
 * There is no POST (create) and no DELETE. The eleven templates are seeded by
 * migration and each one is referenced by a `templateKey` literal in the code
 * that triggers it — so a template an admin invented would never be sent, and a
 * template an admin deleted would break the flow that depends on it. Disabling is
 * the supported way to stop a notification, and `reset` is the way back from a
 * bad edit.
 */
@ApiTags('Email Templates')
@ApiBearerAuth()
@Controller('email-templates')
export class EmailTemplatesController {
  constructor(private readonly templates: EmailTemplateService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('email-templates.view')
  @ApiOperation({
    summary: 'List all email templates',
    description:
      'Returns all eleven templates ordered by key. Unpaginated — the set is fixed by migration.',
  })
  @ApiResponse({ status: 200, description: 'Templates retrieved.' })
  @ApiResponse({ status: 403, description: 'Missing email-templates.view.' })
  findAll() {
    return this.templates.findAll();
  }

  /**
   * Declared before `GET :key` — Nest matches in declaration order, so
   * `/email-templates/placeholders` would otherwise bind to the `:key` param and
   * 404 as a missing template.
   */
  @Get('placeholders')
  @UseGuards(PermissionGuard)
  @RequirePermission('email-templates.view')
  @ApiOperation({
    summary: 'The placeholder vocabulary',
    description:
      'Every token a template may use, grouped for the editor\'s insert menu. Anything outside this list is left as literal text at render time.',
  })
  @ApiResponse({ status: 200, description: 'Placeholders retrieved.' })
  placeholders() {
    return this.templates.placeholders();
  }

  @Get(':key')
  @UseGuards(PermissionGuard)
  @RequirePermission('email-templates.view')
  @ApiParam({ name: 'key', example: 'password_reset' })
  @ApiOperation({ summary: 'Get one email template' })
  @ApiResponse({ status: 200, description: 'Template retrieved.' })
  @ApiResponse({ status: 404, description: 'Template not found.' })
  findOne(@Param('key') key: string) {
    return this.templates.findByKey(key);
  }

  @Get(':key/versions')
  @UseGuards(PermissionGuard)
  @RequirePermission('email-templates.view')
  @ApiParam({ name: 'key', example: 'password_reset' })
  @ApiOperation({
    summary: 'Version history for a template',
    description: 'Newest first. Append-only — versions are never rewritten or removed.',
  })
  @ApiResponse({ status: 200, description: 'Versions retrieved.' })
  @ApiResponse({ status: 404, description: 'Template not found.' })
  versions(@Param('key') key: string) {
    return this.templates.listVersions(key);
  }

  @Post(':key/preview')
  @HttpCode(200)
  @UseGuards(PermissionGuard)
  @RequirePermission('email-templates.view')
  @ApiParam({ name: 'key', example: 'password_reset' })
  @ApiBody({ type: PreviewEmailTemplateDto, required: false })
  @ApiOperation({
    summary: 'Render a template with sample data',
    description:
      'Returns `{ subject, html }`. Pass unsaved `subject`/`body_html` to preview editor content before saving. Uses the identical render path as a real send, including escaping.',
  })
  @ApiResponse({ status: 200, description: 'Preview rendered.' })
  @ApiResponse({ status: 404, description: 'Template not found.' })
  preview(@Param('key') key: string, @Body() dto: PreviewEmailTemplateDto) {
    return this.templates.preview(key, dto);
  }

  @Patch(':key')
  @UseGuards(PermissionGuard)
  @RequirePermission('email-templates.update')
  @ApiParam({ name: 'key', example: 'password_reset' })
  @ApiBody({ type: UpdateEmailTemplateDto })
  @ApiOperation({
    summary: 'Update a template',
    description:
      'A content change (subject or body) snapshots the current version and increments the version number. Metadata-only changes (name, description, enabled) do not create a version.',
  })
  @ApiResponse({ status: 200, description: 'Template updated.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 403, description: 'Missing email-templates.update.' })
  @ApiResponse({ status: 404, description: 'Template not found.' })
  update(
    @Param('key') key: string,
    @Body() dto: UpdateEmailTemplateDto,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    return this.templates.update(key, dto, actorFrom(user, request));
  }

  @Post(':key/restore')
  @HttpCode(200)
  @UseGuards(PermissionGuard)
  @RequirePermission('email-templates.update')
  @ApiParam({ name: 'key', example: 'password_reset' })
  @ApiBody({ type: RestoreEmailTemplateVersionDto })
  @ApiOperation({
    summary: 'Restore an earlier version',
    description:
      'Re-applies the chosen version\'s content as a NEW version. History is append-only, so the restore itself is recorded rather than erasing the versions in between.',
  })
  @ApiResponse({ status: 200, description: 'Version restored.' })
  @ApiResponse({ status: 404, description: 'Template or version not found.' })
  restore(
    @Param('key') key: string,
    @Body() dto: RestoreEmailTemplateVersionDto,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    return this.templates.restoreVersion(key, dto.version, actorFrom(user, request));
  }

  @Post(':key/reset')
  @HttpCode(200)
  @UseGuards(PermissionGuard)
  @RequirePermission('email-templates.update')
  @ApiParam({ name: 'key', example: 'password_reset' })
  @ApiOperation({
    summary: 'Reset a template to the shipped default',
    description:
      'Restores the copy that ships with the application. The customised content is snapshotted as a version first, so this is reversible.',
  })
  @ApiResponse({ status: 200, description: 'Template reset.' })
  @ApiResponse({ status: 404, description: 'Template not found.' })
  reset(
    @Param('key') key: string,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    return this.templates.resetToDefault(key, actorFrom(user, request));
  }
}
