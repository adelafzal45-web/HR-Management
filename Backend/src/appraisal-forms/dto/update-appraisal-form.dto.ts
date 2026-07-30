import { PartialType } from '@nestjs/swagger';
import { CreateAppraisalFormsDto } from './create-appraisal-forms.dto';

export class UpdateAppraisalFormsDto extends PartialType(
  CreateAppraisalFormsDto,
) {}
