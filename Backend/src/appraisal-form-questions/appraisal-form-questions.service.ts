import { Injectable } from '@nestjs/common';
import { CreateAppraisalFormQuestionDto } from './dto/create-appraisal-form-question.dto';
import { UpdateAppraisalFormQuestionDto } from './dto/update-appraisal-form-question.dto';

@Injectable()
export class AppraisalFormQuestionsService {
  create(createAppraisalFormQuestionDto: CreateAppraisalFormQuestionDto) {
    return 'This action adds a new appraisalFormQuestion';
  }

  findAll() {
    return `This action returns all appraisalFormQuestions`;
  }

  findOne(id: number) {
    return `This action returns a #${id} appraisalFormQuestion`;
  }

  update(
    id: number,
    updateAppraisalFormQuestionDto: UpdateAppraisalFormQuestionDto,
  ) {
    return `This action updates a #${id} appraisalFormQuestion`;
  }

  remove(id: number) {
    return `This action removes a #${id} appraisalFormQuestion`;
  }
}
