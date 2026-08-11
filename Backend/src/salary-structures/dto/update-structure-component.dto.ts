import { PartialType, OmitType } from '@nestjs/mapped-types';

import { StructureComponentDto } from './create-salary-structure.dto';

/**
 * Editing a structure membership changes only its override values and order —
 * the component it points at is the membership's identity. To swap the
 * component, remove this membership and add the other one.
 */
export class UpdateStructureComponentDto extends PartialType(
  OmitType(StructureComponentDto, ['component_id'] as const),
) {}
