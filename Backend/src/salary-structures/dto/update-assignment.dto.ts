import { PartialType } from '@nestjs/mapped-types';

import { CreateStructureAssignmentDto } from './create-assignment.dto';

export class UpdateStructureAssignmentDto extends PartialType(
  CreateStructureAssignmentDto,
) {}
