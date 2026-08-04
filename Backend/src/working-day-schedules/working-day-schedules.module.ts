import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WorkingDaySchedule } from './working-day-schedules.entity';
import { WorkingDaySchedulesController } from './working-day-schedules.controller';
import { WorkingDaySchedulesService } from './working-day-schedules.service';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [TypeOrmModule.forFeature([WorkingDaySchedule]), AuthorizationModule],
  controllers: [WorkingDaySchedulesController],
  providers: [WorkingDaySchedulesService],
  exports: [WorkingDaySchedulesService, TypeOrmModule],
})
export class WorkingDaySchedulesModule {}
