import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Designation } from './designation.entity';
import { DesignationController } from './designation.controller';
import { DesignationService } from './designation.service';

@Module({
  imports: [TypeOrmModule.forFeature([Designation])],
  controllers: [DesignationController],
  providers: [DesignationService],
  exports: [DesignationService],
})
export class DesignationModule {}
