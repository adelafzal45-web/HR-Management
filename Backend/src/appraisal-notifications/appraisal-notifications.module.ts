import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppraisalNotification } from './appraisal-notification.entity';

/**
 * Owns the `appraisal_notifications` table.
 *
 * No controller and no service of its own yet: notifications are written by the
 * scheduler and the workflow service, and read through
 * `GET /appraisal/notifications` on the facade. This module exists so the entity
 * is registered with `autoLoadEntities` and so the repository can be injected by
 * the modules that do own that behaviour.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AppraisalNotification])],
  exports: [TypeOrmModule],
})
export class AppraisalNotificationsModule {}
