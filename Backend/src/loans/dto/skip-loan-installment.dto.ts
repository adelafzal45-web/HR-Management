import {
  IsString,
  IsUUID,
} from 'class-validator';

import {
  ApiProperty,
} from '@nestjs/swagger';

export class SkipLoanInstallmentDto {
  @ApiProperty({
    example: 'e5f6a7b8-9c0d-1e2f-3a4b-5c6d7e8f9a0b',
    description: 'Installment UUID to skip.',
  })
  @IsUUID()
  loan_installment_id!: string;

  @ApiProperty({
    example:
      'Employee requested temporary deferment of this installment.',
  })
  @IsString()
  reason!: string;
}