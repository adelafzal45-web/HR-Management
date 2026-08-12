import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Holiday } from './holiday.entity';
import { HolidaysService } from './holidays.service';
import { HolidaysController } from './holidays.controller';
import { AuthorizationModule } from '../authorization/authorization.module';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Company holiday (and event) calendar. Exports `HolidaysService` so
 * `LeaveEntitlementsModule` (day counting) and `AttendanceModule` can both
 * exclude holidays from working-day calculations off the same source of
 * truth. Imports `NotificationsModule` so a holiday/event created with
 * `notify: true` can be announced to every active employee.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Holiday]),
    AuthorizationModule,
    NotificationsModule,
  ],
  controllers: [HolidaysController],
  providers: [HolidaysService],
  exports: [HolidaysService],
})
export class HolidaysModule {}
