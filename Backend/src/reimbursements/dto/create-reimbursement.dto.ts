import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateReimbursementDto {
  @ApiProperty({
    example:
      'a3f1c2d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  })
  @IsUUID()
  user_id!: string;

  @ApiProperty({
    example: 5000,
  })
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiProperty({
    example: 'TRAVEL',
  })
  @IsString()
  reimbursement_type!: string;

  @ApiProperty({
    example:
      'Travel expenses for client meeting.',
  })
  @IsString()
  description!: string;

  @ApiProperty({
    example: '2026-08-20',
  })
  @IsDateString()
  expense_date!: string;

  @ApiPropertyOptional({
    example:
      'uploads/reimbursements/receipt.pdf',
  })
  @IsOptional()
  @IsString()
  attachment_path?: string;

  @ApiPropertyOptional({
    example: 'receipt.pdf',
  })
  @IsOptional()
  @IsString()
  attachment_name?: string;
}