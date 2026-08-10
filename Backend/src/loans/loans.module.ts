import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';

import { Loan } from './loan.entity';
import { LoanInstallment } from './loan-installment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Loan,
      LoanInstallment,
    ]),
  ],
  controllers: [
    LoansController,
  ],
  providers: [
    LoansService,
  ],
  exports: [
    LoansService,
  ],
})
export class LoansModule {}