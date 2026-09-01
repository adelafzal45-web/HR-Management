import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SlackSettings } from './entities/slack-settings.entity';

import { SlackSettingsService } from './slack-settings.service';
import { SlackService } from './slack.service';

import { SlackSettingsController } from './slack-settings.controller';

import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';

/**
 * Slack integration: org-wide bot-token configuration and the reusable
 * outbound-message transport.
 *
 * Exports `SlackService` only. The rest of the application posts through its
 * `sendMessage` method and has no business reaching the stored token or the
 * settings row directly — the birthday/anniversary announcer (#2) and the
 * appraisal-pending reminder (#3) will inject this service.
 *
 * Modelled on `MailModule`: a single-row settings table, a secret encrypted at
 * rest, a masked read, and a synchronous permission-guarded test. `AuditModule`
 * supplies the trail for updates and test sends; `AuthorizationModule` supplies
 * the AuthorizationService that PermissionGuard resolves grants through.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SlackSettings]),
    AuditModule,
    AuthorizationModule,
  ],
  controllers: [SlackSettingsController],
  providers: [SlackSettingsService, SlackService],
  exports: [SlackService],
})
export class SlackModule {}
