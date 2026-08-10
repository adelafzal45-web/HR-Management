import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

import { TaxType } from '../enums/tax-type.enum';

export class TaxSlabDto {
  @ApiProperty({
    enum: TaxType,
    example: TaxType.MONTHLY,
  })
  @IsEnum(TaxType)
  tax_type!: TaxType;

  @ApiProperty({
    example: 50000,
  })
  @IsNumber()
  @Min(0)
  min_income!: number;

  @ApiPropertyOptional({
    example: 100000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  max_income?: number | null;

  @ApiProperty({
    example: 5,
  })
  @IsNumber()
  @Min(0)
  tax_rate!: number;

  @ApiPropertyOptional({
    example: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fixed_tax?: number;

  @ApiPropertyOptional({
    example:
      'Tax slab for middle-income employees.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}