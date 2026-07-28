import { PartialType } from '@nestjs/mapped-types';

import { CreateAppraisalQuestionWeightDto } from './create.dto';

export class UpdateAppraisalQuestionWeightDto extends PartialType(
  CreateAppraisalQuestionWeightDto,
) {}