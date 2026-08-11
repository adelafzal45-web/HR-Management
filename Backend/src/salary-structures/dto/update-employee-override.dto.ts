import { PartialType, OmitType } from '@nestjs/mapped-types';

import { CreateEmployeeOverrideDto } from './create-employee-override.dto';

/**
 * The employee/component pairing identifies the override and is immutable on
 * update — to re-target it, delete and recreate. Only the override values and
 * effective window can change.
 */
export class UpdateEmployeeOverrideDto extends PartialType(
  OmitType(CreateEmployeeOverrideDto, ['user_id', 'component_id'] as const),
) {}
