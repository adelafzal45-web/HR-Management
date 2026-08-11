import { PartialType, OmitType } from '@nestjs/mapped-types';

import { CreateSalaryStructureDto } from './create-salary-structure.dto';

/**
 * Updating a structure edits only its own fields (name, description, active).
 * Component membership is managed through the dedicated
 * `/salary-structures/:id/components` routes, so `components` is omitted here to
 * avoid two conflicting ways to mutate the same set.
 */
export class UpdateSalaryStructureDto extends PartialType(
  OmitType(CreateSalaryStructureDto, ['components'] as const),
) {}
