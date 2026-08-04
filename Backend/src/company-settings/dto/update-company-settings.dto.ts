import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * All fields are optional: this backs a PATCH against the single existing row,
 * so a client may send only the fields it is changing. `@IsNotEmpty` still
 * rejects an explicit empty string for columns the database declares NOT NULL.
 */
export class UpdateCompanySettingsDto {
  @ApiPropertyOptional({
    example: 'TechnoCues HR Management Pvt Ltd',
    description: 'Legal company name',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  legal_company_name?: string;

  @ApiPropertyOptional({
    example: 'REG-2024-001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  registration_number?: string;

  @ApiPropertyOptional({
    example: 'Information Technology',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @ApiPropertyOptional({
    example: 'Asia/Karachi',
    description: 'IANA timezone identifier',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  timezone?: string;

  @ApiPropertyOptional({
    example: 'PKR',
    description: 'ISO 4217 currency code',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  currency?: string;

  @ApiPropertyOptional({
    example: 'Mon-Fri',
    description:
      'Human-readable default working days. The authoritative per-day config lives in working_day_schedules.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  working_days?: string;

  @ApiPropertyOptional({
    example: 'TechnoCues',
    description: 'Display name (branding)',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  company_name?: string;

  @ApiPropertyOptional({
    example: 'https://technocues.com/logo.png',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logo_url?: string;

  @ApiPropertyOptional({
    example: 'https://technocues.com/logo-sm.png',
    description: 'Logo variant for the collapsed/folded sidebar',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logo_collapsed_url?: string;

  @ApiPropertyOptional({
    example: 'https://technocues.com/favicon.ico',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  favicon_url?: string;

  @ApiPropertyOptional({
    example: 'info@technocues.com',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    example: '+92 300 1234567',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({
    example: '123 Main St, Islamabad, Pakistan',
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    example: 'https://technocues.com',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @ApiPropertyOptional({
    example: '#F1B344',
    description: 'Primary theme color, applied app-wide as a CSS variable',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'primary_color must be a valid hex color (e.g. #F1B344)',
  })
  primary_color?: string;
}
