import { PartialType } from '@nestjs/mapped-types';
import { CreateAppraisalQuestionDto } from './create-appraisal-question.dto';

export class UpdateAppraisalQuestionDto extends PartialType(
  CreateAppraisalQuestionDto,
) {}
