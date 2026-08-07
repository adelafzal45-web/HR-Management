import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Holiday } from './holiday.entity';
import { HolidaysService } from './holidays.service';
import { HolidaysController } from './holidays.controller';
import { AuthorizationModule } from '../authorization/authorization.module';

/**
 * Company holiday calendar. Exports `HolidaysService` so
 * `LeaveEntitlementsModule` (day counting) and `AttendanceModule` can both
 * exclude holidays from working-day calculations off the same source of
 * truth.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Holiday]), AuthorizationModule],
  controllers: [HolidaysController],
  providers: [HolidaysService],
  exports: [HolidaysService],
})
export class HolidaysModule {}
