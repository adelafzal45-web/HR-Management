import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** One progressive bracket within a tax config. */
export class TaxSlabDto {
  @ApiProperty({ example: 600000, description: 'Annual income floor (exclusive).' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  lower_bound!: number;

  @ApiPropertyOptional({
    example: 1200000,
    description: 'Annual income ceiling (inclusive); omit for the top bracket.',
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  upper_bound?: number | null;

  @ApiProperty({ example: 0, description: 'Flat annual tax at this bracket.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  base_tax!: number;

  @ApiProperty({ example: 5, description: 'Marginal rate above lower_bound (%).' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rate_percent!: number;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  display_order?: number;
}

/**
 * Create a tax config with its slabs in one call (spec §10). The service sorts
 * the slabs by lower_bound and validates that they form a coherent progressive
 * ladder before storing.
 */
export class CreateTaxConfigDto {
  @ApiProperty({ example: 'FBR Salaried 2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'FBR', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  regime?: string;

  @ApiPropertyOptional({ example: 'PKR', default: 'PKR' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  annualize?: boolean;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiProperty({ type: [TaxSlabDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaxSlabDto)
  slabs!: TaxSlabDto[];

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'effective_from must be an ISO date (YYYY-MM-DD).',
  })
  effective_from?: string;

  @ApiPropertyOptional({ example: '2027-06-30' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'effective_to must be an ISO date (YYYY-MM-DD).',
  })
  effective_to?: string;
}
