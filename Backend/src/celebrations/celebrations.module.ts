import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthorizationModule } from '../authorization/authorization.module';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { Notification } from '../notifications/notifications.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { SlackModule } from '../slack/slack.module';
import { User } from '../users/user.entity';

import { CelebrationSchedulerService } from './celebration-scheduler.service';
import { CelebrationsController } from './celebrations.controller';
import { CelebrationsService } from './celebrations.service';

/**
 * Birthday & work-anniversary announcements (backlog #2, configurable in #2b).
 *
 * Owns no table of its own: it reads `users` for today's celebrants and writes
 * to the shared `notifications` bell via NotificationsService, then posts a
 * daily summary through SlackService (which respects the Slack enabled switch).
 * The same read backs the dashboard widget via `GET /celebrations/today`; the
 * poll-cron announcer lives in CelebrationSchedulerService, which reads its
 * schedule and wording from CompanySettingsModule's `celebration_config`.
 *
 * ScheduleModule is registered once globally in AppModule — not re-registered
 * here.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Notification]),
    NotificationsModule,
    SlackModule,
    CompanySettingsModule,
    // AuthorizationModule supplies the AuthorizationService that the
    // PermissionGuard on POST /celebrations/announce resolves grants through.
    AuthorizationModule,
  ],
  controllers: [CelebrationsController],
  providers: [CelebrationsService, CelebrationSchedulerService],
})
export class CelebrationsModule {}
