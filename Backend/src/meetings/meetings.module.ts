import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Meeting } from './meetings.entity';
import { MeetingParticipant } from './meeting-participant.entity';
import { User } from '../users/user.entity';

import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { MeetingNotifierService } from './meeting-notifier.service';
import { AuthorizationModule } from '../authorization/authorization.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Meeting, MeetingParticipant, User]),
    AuthorizationModule,
    MailModule,
    // In-app + email dispatch for invitations, updates and cancellations
    // (MeetingNotifierService gates each channel on the meeting's own flags).
    NotificationsModule,
  ],
  controllers: [MeetingsController],
  providers: [MeetingsService, MeetingNotifierService],
  exports: [MeetingsService, MeetingNotifierService],
})
export class MeetingsModule {}
