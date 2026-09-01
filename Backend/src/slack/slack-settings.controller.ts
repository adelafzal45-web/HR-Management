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

import { SlackSettingsService } from './slack-settings.service';
import { SlackService } from './slack.service';
import { UpdateSlackSettingsDto } from './dto/update-slack-settings.dto';
import { SendTestSlackMessageDto } from './dto/send-test-slack-message.dto';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/auth.constants';
import { AuditService } from '../audit/audit.service';
import { actorFrom } from '../common/audit/actor.util';

/**
 * Slack integration configuration for the deployment.
 *
 * Separate permissions for view / update / test rather than one `manage`,
 * following the mail settings: reading the configuration is reasonable for
 * anyone diagnosing why announcements are not arriving, while changing the bot
 * token is not. The test endpoint gets its own key because it causes an outbound
 * message, which is a side-effect a read permission should not grant.
 */
@ApiTags('Slack Settings')
@ApiBearerAuth()
@Controller('slack-settings')
export class SlackSettingsController {
  constructor(
    private readonly slackSettings: SlackSettingsService,
    private readonly slack: SlackService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('slack-settings.view')
  @ApiOperation({
    summary: 'Get Slack settings',
    description:
      'Returns the Slack configuration. The bot token is never included — only `token_set` indicates whether one is stored.',
  })
  @ApiResponse({ status: 200, description: 'Settings retrieved.' })
  @ApiResponse({ status: 403, description: 'Missing slack-settings.view.' })
  get() {
    return this.slackSettings.getResponse();
  }

  @Get('status')
  @UseGuards(PermissionGuard)
  @RequirePermission('slack-settings.view')
  @ApiOperation({
    summary: 'Whether the current configuration can post',
    description:
      'Returns `{ ready, reason }`. Validates that a token, a default channel and the enabled flag are all in place — not that the token works, which only a test send can establish.',
  })
  @ApiResponse({ status: 200, description: 'Status resolved.' })
  async status() {
    const reason = await this.slackSettings.validate();
    return { ready: reason === null, reason };
  }

  @Patch()
  @UseGuards(PermissionGuard)
  @RequirePermission('slack-settings.update')
  @ApiOperation({
    summary: 'Update Slack settings',
    description:
      'Partial update of the single settings row. `token` is write-only and stored AES-256-GCM encrypted.',
  })
  @ApiBody({ type: UpdateSlackSettingsDto })
  @ApiResponse({ status: 200, description: 'Settings updated.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 403, description: 'Missing slack-settings.update.' })
  async update(
    @Body() dto: UpdateSlackSettingsDto,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    const before = await this.slackSettings.getResponse();
    const after = await this.slackSettings.update(dto);

    // The DTO is not passed to the audit trail as-is: it carries the plaintext
    // token. AuditService would redact a field named `token`, but relying on
    // that here would mean the safety of this call depends on a string match in
    // another module. The projections never contain the secret in the first place.
    await this.audit.record({
      actor: actorFrom(user, request),
      action: 'slack.settings.update',
      entityType: 'slack_settings',
      entityId: '1',
      ...this.audit.diff(
        before as unknown as Record<string, unknown>,
        after as unknown as Record<string, unknown>,
      ),
    });

    return after;
  }

  @Post('test')
  @HttpCode(200)
  @UseGuards(PermissionGuard)
  @RequirePermission('slack-settings.test')
  @ApiOperation({
    summary: 'Send a test message',
    description:
      "Posts one message immediately so the Slack error (if any) is returned in this response. The result is recorded as `last_test_ok` / `last_test_error`. Optional `channel` overrides the configured default.",
  })
  @ApiBody({ type: SendTestSlackMessageDto })
  @ApiResponse({ status: 200, description: 'Test message sent.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 403, description: 'Missing slack-settings.test.' })
  @ApiResponse({
    status: 503,
    description:
      'Slack is not configured or rejected the message (token, channel, or membership).',
  })
  async sendTest(
    @Body() dto: SendTestSlackMessageDto,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    try {
      return await this.slack.sendTest(dto.channel, actorFrom(user, request));
    } catch (error) {
      // 503 rather than 500: the failure is in an upstream dependency, not in
      // this application, and Slack's own error code is the only useful
      // diagnostic — so it is surfaced verbatim rather than replaced with
      // "Internal server error".
      throw new ServiceUnavailableException(
        `Test message failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
