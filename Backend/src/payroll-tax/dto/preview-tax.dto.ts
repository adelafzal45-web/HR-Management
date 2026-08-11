import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * "Preview tax on ₨X" request (spec §10, §15 test-rule spirit): run a sample
 * annual taxable income through a tax config's slabs and return the breakdown
 * without touching a payslip. When `tax_config_id` is omitted the active config
 * is used.
 */
export class PreviewTaxDto {
  @ApiProperty({ example: 1800000, description: 'Annual taxable income.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  annual_taxable!: number;

  @ApiPropertyOptional({
    description: 'Config to test; defaults to the active config.',
  })
  @IsOptional()
  @IsString()
  tax_config_id?: string;
}
