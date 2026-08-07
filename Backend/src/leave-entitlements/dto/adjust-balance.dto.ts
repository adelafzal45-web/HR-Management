import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum AdjustDirection {
  INCREASE = 'increase',
  DEDUCT = 'deduct',
}

/** Increase or deduct balance on a single existing entitlement by id. */
export class AdjustBalanceDto {
  @ApiProperty({ enum: AdjustDirection })
  @IsEnum(AdjustDirection)
  direction!: AdjustDirection;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @Min(0.5)
  days!: number;

  @ApiPropertyOptional({
    default: false,
    description: 'Allow a deduct to push the remaining balance below zero.',
  })
  @IsOptional()
  allow_negative?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
