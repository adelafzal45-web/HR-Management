import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { EntitlementTargetDto } from './entitlement-target.dto';

/**
 * `set`      overwrite `entitled_days` with `days` (used for the initial
 *            yearly grant, "Add entitlement").
 * `increase` add `days` on top of the existing entitlement (recorded as a
 *            positive Adjustment).
 * `deduct`   subtract `days` from the existing entitlement (recorded as a
 *            negative Adjustment). Refused if it would push the balance
 *            negative unless `allow_negative` is set.
 */
export enum EntitlementMode {
  SET = 'set',
  INCREASE = 'increase',
  DEDUCT = 'deduct',
}

export class CreateEntitlementDto {
  @ApiProperty()
  @IsUUID('4')
  leave_type_id!: string;

  @ApiProperty({ example: 2026 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @ApiProperty({ type: EntitlementTargetDto })
  @ValidateNested()
  @Type(() => EntitlementTargetDto)
  target!: EntitlementTargetDto;

  @ApiProperty({ enum: EntitlementMode, default: EntitlementMode.SET })
  @IsEnum(EntitlementMode)
  mode!: EntitlementMode;

  @ApiProperty({ example: 14, description: 'Number of days for the chosen mode.' })
  @IsNumber()
  @Min(0)
  days!: number;

  @ApiPropertyOptional({
    default: false,
    description: 'Allow a deduct to push the remaining balance below zero.',
  })
  @IsOptional()
  allow_negative?: boolean;

  @ApiPropertyOptional({ description: 'Reason recorded in the leave-history note.' })
  @IsOptional()
  @IsString()
  note?: string;
}
