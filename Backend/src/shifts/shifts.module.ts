import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Shift } from './shifts.entity';

import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { AuthorizationModule } from '../authorization/authorization.module';
@Module({
  imports: [TypeOrmModule.forFeature([Shift]),AuthorizationModule],
  controllers: [ShiftsController],
  providers: [ShiftsService],
  exports: [ShiftsService, TypeOrmModule],
})
export class ShiftsModule {}
