import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  Matches,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { SIGNATURE_UPLOAD } from '../../common/upload/image-upload';

/**
 * "This is a path the signature upload endpoint issued."
 *
 * An empty string is allowed and means "clear it" — the columns are nullable,
 * and removing a signature must not require inventing a path.
 *
 * Logo and favicon URLs deliberately do *not* carry this check. They may point
 * at a CDN the company already uses, and they were free-form long before an
 * upload button existed. A signature is different: it is only ever produced by
 * the upload endpoint, and an unchecked value would let anyone who can edit
 * settings print an arbitrary remote image on every certificate the company
 * issues.
 */
function IsSignatureUploadPath(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSignatureUploadPath',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          if (value === '') return true;
          return (
            typeof value === 'string' &&
            value.startsWith(`${SIGNATURE_UPLOAD.urlPrefix}/`) &&
            !value.slice(SIGNATURE_UPLOAD.urlPrefix.length + 1).includes('/')
          );
        },
        defaultMessage() {
          return 'Upload the signature through the signature endpoint — a link to somewhere else cannot be used.';
        },
      },
    });
  };
}

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
    example: '/uploads/company-branding/abc123.png',
    description:
      'Path returned by POST /company-settings/asset/logo, or an absolute URL to an externally hosted image.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logo_url?: string;

  @ApiPropertyOptional({
    example: '/uploads/company-branding/def456.png',
    description: 'Logo variant for the collapsed/folded sidebar',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logo_collapsed_url?: string;

  @ApiPropertyOptional({
    example: '/uploads/company-branding/ghi789.ico',
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

  // ---- Certificate signatories ----------------------------------------
  //
  // Each name and signature is independent and optional; a certificate with
  // none configured still generates. Send an empty string to clear one — the
  // columns are nullable and `@IsNotEmpty` is deliberately absent here, unlike
  // the NOT NULL columns above.
  //
  // The signature URLs must name a file this server issued, which is why they
  // carry the upload-prefix check rather than plain `@IsString()`: they are
  // echoed back by the client from the upload endpoint, so an unchecked value
  // would let a caller print any remote image on every certificate.

  @ApiPropertyOptional({ example: 'Ayesha Malik', description: 'CEO name' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  ceo_name?: string;

  @ApiPropertyOptional({
    example: '/uploads/company-signatures/abc123.png',
    description:
      'Path returned by POST /company-settings/asset/ceo-signature.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @IsSignatureUploadPath()
  ceo_signature_url?: string;

  @ApiPropertyOptional({ example: 'Bilal Ahmed', description: 'Co-Founder name' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  cofounder_name?: string;

  @ApiPropertyOptional({
    example: '/uploads/company-signatures/def456.png',
    description:
      'Path returned by POST /company-settings/asset/cofounder-signature.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @IsSignatureUploadPath()
  cofounder_signature_url?: string;
}
