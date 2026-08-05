import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PublicHoliday } from './public-holidays.entity';
import { PublicHolidaysController } from './public-holidays.controller';
import { PublicHolidaysService } from './public-holidays.service';

import { User } from '../users/user.entity';
import { Notification } from '../notifications/notifications.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PublicHoliday, User, Notification])],

  controllers: [PublicHolidaysController],

  providers: [PublicHolidaysService],

  exports: [PublicHolidaysService],
})
export class PublicHolidaysModule {}
