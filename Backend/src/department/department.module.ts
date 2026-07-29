import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Department } from './department.entity';
import { DepartmentsController } from './department.controller';
import { DepartmentsService } from './department.service';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [TypeOrmModule.forFeature([Department]),AuthorizationModule],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
  exports: [DepartmentsService, TypeOrmModule],
})
export class DepartmentsModule {}
