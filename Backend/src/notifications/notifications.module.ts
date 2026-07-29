import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Notification } from './notifications.entity';
import { User } from '../users/user.entity';

import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { AuthorizationModule } from '../authorization/authorization.module';
@Module({
  imports: [TypeOrmModule.forFeature([Notification, User]),AuthorizationModule ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
