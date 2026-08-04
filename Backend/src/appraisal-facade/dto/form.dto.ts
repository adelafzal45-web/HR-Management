import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { EvaluationType } from '../../appraisal-forms/appraisal-forms.entity';

/**
 * The form's audience, settable in the same request that creates or edits it.
 *
 * These write `appraisal_form_assignments` rows — the same table the
 * Assignments tab writes one row at a time. Sending an array replaces the whole
 * set for that target type; omitting it leaves the existing rows alone, which
 * is what makes a partial `PUT /forms/:id` (rename only, say) safe.
 *
 * Per-employee assignments are deliberately not settable here. Those are
 * individual overrides that outrank both of these in `resolveFormForEmployee`,
 * and quietly clearing them from a form-level save would be a surprise.
 */
class FormAudienceFields {
  @ApiPropertyOptional({
    type: [String],
    description:
      'Departments this form applies to. Replaces the existing department assignments.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  departmentIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'Designations that may evaluate under this form. Replaces the existing designation assignments.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  designationIds?: string[];
}

export class CreateFormDto extends FormAudienceFields {
  @ApiProperty({ example: 'Engineering Monthly Review' })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  formName!: string;

  @ApiPropertyOptional({ example: 'Monthly review for the engineering org.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: EvaluationType, example: EvaluationType.MONTHLY })
  @IsEnum(EvaluationType)
  evaluationType!: EvaluationType;
}

export class UpdateFormDto extends FormAudienceFields {
  @ApiPropertyOptional({ example: 'Engineering Monthly Review' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  formName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: EvaluationType })
  @IsOptional()
  @IsEnum(EvaluationType)
  evaluationType?: EvaluationType;
}
