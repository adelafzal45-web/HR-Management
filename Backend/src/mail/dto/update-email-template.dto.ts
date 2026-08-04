import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { Trim, TrimOptional } from '../../users/dto/validation.constants';

/**
 * PATCH body for one email template.
 *
 * `template_key` is deliberately absent: it is the stable identifier that
 * application code enqueues against, so renaming it would silently break the
 * trigger that uses it. The key comes from the route parameter and is not
 * editable through any endpoint.
 */
export class UpdateEmailTemplateDto {
  @ApiPropertyOptional({ example: 'Welcome to {{company_name}}' })
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'subject cannot be empty' })
  @MaxLength(255)
  subject?: string;

  @ApiPropertyOptional({
    description:
      'Body fragment only — the branded shell (header, logo, footer) is applied at render time.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'body_html cannot be empty' })
  @MaxLength(100_000)
  body_html?: string;

  @ApiPropertyOptional({ example: 'Welcome Employee' })
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @TrimOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'A disabled template causes its trigger to be skipped silently rather than to fail.',
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/**
 * Preview request.
 *
 * Both fields are optional so the screen can preview the saved copy with sample
 * data (`POST .../preview` with an empty body). Supplying `subject`/`body_html`
 * previews unsaved editor content, which is the whole point — an admin needs to
 * see the result before committing it.
 */
export class PreviewEmailTemplateDto {
  @ApiPropertyOptional({ description: 'Unsaved subject to preview instead of the stored one' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string;

  @ApiPropertyOptional({ description: 'Unsaved body to preview instead of the stored one' })
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  body_html?: string;

  /**
   * Placeholder overrides. Values outside the renderer's allow-list are
   * discarded there, so a caller cannot introduce new placeholders by preview.
   */
  @ApiPropertyOptional({
    description: 'Placeholder overrides, e.g. { "employee_name": "Ayesha Khan" }',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject()
  context?: Record<string, string>;
}

export class RestoreEmailTemplateVersionDto {
  @ApiPropertyOptional({ example: 3, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
