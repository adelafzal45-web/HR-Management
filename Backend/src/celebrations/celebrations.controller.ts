import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

import { CelebrationSchedulerService } from './celebration-scheduler.service';
import { CelebrationsService } from './celebrations.service';
import { AnnouncementResult, TodaysCelebrations } from './celebrations.types';

/**
 * Today's birthdays and work anniversaries for the dashboard widget, plus the
 * manual "send now" trigger for the Celebrations settings screen.
 *
 * `GET /today` carries no `@RequirePermission`: like `GET /dashboard/me`, it is
 * authenticated by the global JwtAuthGuard but otherwise ungated, because every
 * role's dashboard shows the card and the payload is deliberately non-sensitive
 * — names, designations and avatars only, never a birth year or age.
 *
 * `POST /announce` is different — it writes bell rows for everyone and posts to
 * Slack — so it is gated by `company-settings.update`, the same permission that
 * edits the celebration config (backlog #2b reuses the company-settings
 * permissions rather than seeding its own, matching the biometric feature).
 */
@ApiTags('Celebrations')
@Controller('celebrations')
export class CelebrationsController {
  constructor(
    private readonly celebrationsService: CelebrationsService,
    private readonly celebrationScheduler: CelebrationSchedulerService,
  ) {}

  @Get('today')
  @ApiOperation({
    summary: "Today's birthdays and work anniversaries",
    description:
      'Active employees whose date of birth or joining date falls on today. Non-sensitive: no birth year or age is returned.',
  })
  @ApiResponse({ status: 200, description: "Today's celebrations." })
  getToday(): Promise<TodaysCelebrations> {
    return this.celebrationsService.getTodaysCelebrations();
  }

  @Post('announce')
  @UseGuards(PermissionGuard)
  @RequirePermission('company-settings.update')
  @ApiOperation({
    summary: "Send today's celebration announcement now",
    description:
      'Immediately runs the birthday/anniversary announcement — the bell broadcast, each celebrant\'s personal wish, and the Slack summary — using the saved config wording. Bypasses the scheduled send-time window and the once-per-day guard (so it can be re-sent), but respects the re-entrancy flag. Returns what was sent.',
  })
  @ApiResponse({ status: 201, description: 'Announcement processed.' })
  @ApiResponse({
    status: 403,
    description: 'User does not have company-settings.update permission.',
  })
  announceNow(): Promise<AnnouncementResult> {
    return this.celebrationScheduler.runNow();
  }
}
