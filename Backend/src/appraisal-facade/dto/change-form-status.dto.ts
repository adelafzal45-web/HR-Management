import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { FormStatus } from '../../appraisal-forms/appraisal-forms.entity';

/**
 * Body for `PATCH /appraisal/forms/:formId/status`.
 *
 * Both fields are optional but at least one must be present — the service
 * rejects an empty body rather than reporting success for a no-op, so a UI bug
 * that drops the payload surfaces instead of looking like it worked.
 *
 * `status` and `isActive` are separate axes and deliberately so. Archiving a
 * form takes it out of circulation permanently; deactivating it pauses new
 * evaluations while leaving it publishable-and-ready. Collapsing them into one
 * field would make "temporarily off" indistinguishable from "retired".
 */
export class ChangeFormStatusDto {
  @ApiPropertyOptional({
    enum: FormStatus,
    description:
      'Target lifecycle status. Draft → Published publishes (and snapshots questions); Published → Draft is refused once evaluations exist.',
  })
  @IsOptional()
  @IsIn(Object.values(FormStatus))
  status?: FormStatus;

  @ApiPropertyOptional({
    description:
      'Active flag. An inactive form generates no new evaluations but keeps its questions and history. Archived forms are always inactive.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Optional note recorded on the audit entry for this change.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
