import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';

import { Payroll } from './payroll.entity';
import { User } from '../users/user.entity';

import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

@Module({
  imports: [TypeOrmModule.forFeature([Payroll, User])],
  controllers: [PayrollController],
  providers: [PayrollService],
})
export class PayrollModule {}
