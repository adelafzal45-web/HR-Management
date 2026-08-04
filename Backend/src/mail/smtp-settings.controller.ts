import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { SmtpSettingsService } from './smtp-settings.service';
import { MailService } from './mail.service';
import { MailTransportService } from './mail-transport.service';
import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/auth.constants';
import { AuditService } from '../audit/audit.service';
import { actorFrom } from '../common/audit/actor.util';

/**
 * SMTP configuration for the deployment.
 *
 * Separate permissions for view / update / test rather than one `manage`:
 * reading the configuration is reasonable for anyone diagnosing why mail is not
 * arriving, while changing the credentials of the mail server is not. The test
 * endpoint gets its own key because it causes an outbound message, which is a
 * side-effect a read permission should not grant.
 */
@ApiTags('Email Settings')
@ApiBearerAuth()
@Controller('smtp-settings')
export class SmtpSettingsController {
  constructor(
    private readonly smtpSettings: SmtpSettingsService,
    private readonly mail: MailService,
    private readonly transport: MailTransportService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('email-settings.view')
  @ApiOperation({
    summary: 'Get SMTP settings',
    description:
      'Returns the SMTP configuration. The password is never included — only `password_set` indicates whether one is stored. `env_override` is true when SMTP_HOST is set, in which case the stored row is ignored and the fields are read-only.',
  })
  @ApiResponse({ status: 200, description: 'Settings retrieved.' })
  @ApiResponse({ status: 403, description: 'Missing email-settings.view.' })
  get() {
    return this.smtpSettings.getResponse();
  }

  @Get('status')
  @UseGuards(PermissionGuard)
  @RequirePermission('email-settings.view')
  @ApiOperation({
    summary: 'Whether the current configuration can send',
    description:
      'Returns `{ ready, reason }`. Validates that required fields are populated — not that the credentials work, which only a test send can establish.',
  })
  @ApiResponse({ status: 200, description: 'Status resolved.' })
  async status() {
    const reason = await this.smtpSettings.validate();
    return { ready: reason === null, reason };
  }

  @Patch()
  @UseGuards(PermissionGuard)
  @RequirePermission('email-settings.update')
  @ApiOperation({
    summary: 'Update SMTP settings',
    description:
      'Partial update of the single settings row. `password` is write-only and stored AES-256-GCM encrypted. Rejected with 409 while the environment override is active.',
  })
  @ApiBody({ type: UpdateSmtpSettingsDto })
  @ApiResponse({ status: 200, description: 'Settings updated.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 403, description: 'Missing email-settings.update.' })
  @ApiResponse({
    status: 409,
    description: 'SMTP is managed by environment variables and cannot be edited.',
  })
  async update(
    @Body() dto: UpdateSmtpSettingsDto,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    const before = await this.smtpSettings.getResponse();
    const after = await this.smtpSettings.update(dto);

    // The DTO is not passed to the audit trail as-is: it carries the plaintext
    // password. AuditService would redact a field named `password`, but relying on
    // that here would mean the safety of this call depends on a string match in
    // another module. The projections never contain the secret in the first place.
    await this.audit.record({
      actor: actorFrom(user, request),
      action: 'email.settings.update',
      entityType: 'smtp_settings',
      entityId: '1',
      ...this.audit.diff(
        before as unknown as Record<string, unknown>,
        after as unknown as Record<string, unknown>,
      ),
    });

    // A changed host or credential must not keep using the pooled connection
    // built from the previous values.
    this.transport.reset();

    return after;
  }

  @Post('test')
  @HttpCode(200)
  @UseGuards(PermissionGuard)
  @RequirePermission('email-settings.test')
  @ApiOperation({
    summary: 'Send a test email',
    description:
      'Verifies the connection and sends one message immediately, bypassing the queue so the SMTP error (if any) is returned in this response. The result is recorded as `last_test_ok` / `last_test_error`.',
  })
  @ApiBody({ type: SendTestEmailDto })
  @ApiResponse({ status: 200, description: 'Test email sent.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 403, description: 'Missing email-settings.test.' })
  @ApiResponse({
    status: 503,
    description: 'SMTP is not configured or the mail server rejected the connection.',
  })
  async sendTest(
    @Body() dto: SendTestEmailDto,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    try {
      return await this.mail.sendTest(dto.to, actorFrom(user, request));
    } catch (error) {
      // 503 rather than 500: the failure is in an upstream dependency, not in
      // this application, and the SMTP server's own message is the only useful
      // diagnostic — so it is surfaced verbatim rather than replaced with
      // "Internal server error".
      throw new ServiceUnavailableException(
        `Test email failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
