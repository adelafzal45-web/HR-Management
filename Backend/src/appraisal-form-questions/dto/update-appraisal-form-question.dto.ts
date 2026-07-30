import { PartialType } from '@nestjs/swagger';
import { CreateAppraisalFormQuestionDto } from './create-appraisal-form-question.dto';

export class UpdateAppraisalFormQuestionDto extends PartialType(
  CreateAppraisalFormQuestionDto,
) {}
