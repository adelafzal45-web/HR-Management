import {
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class ApproveReimbursementDto {
  @ApiProperty({
    example: true,
    description:
      'Whether the reimbursement should be approved.',
  })
  @IsBoolean()
  approved!: boolean;

  @ApiPropertyOptional({
    example:
      'Approved as a valid business expense.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}