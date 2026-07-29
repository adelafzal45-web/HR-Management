import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Designation } from './designation.entity';
import { DesignationController } from './designation.controller';
import { DesignationService } from './designation.service';
import { Department } from 'src/department/department.entity';
import { AuthorizationModule } from '../authorization/authorization.module';
@Module({
  imports: [TypeOrmModule.forFeature([Designation, Department]),AuthorizationModule],
  controllers: [DesignationController],
  providers: [DesignationService],
  exports: [DesignationService],
})
export class DesignationModule {}
