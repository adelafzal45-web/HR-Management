import { Test, TestingModule } from '@nestjs/testing';
import { AppraisalFormQuestionsController } from './appraisal-form-questions.controller';
import { AppraisalFormQuestionsService } from './appraisal-form-questions.service';

describe('AppraisalFormQuestionsController', () => {
  let controller: AppraisalFormQuestionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppraisalFormQuestionsController],
      providers: [AppraisalFormQuestionsService],
    }).compile();

    controller = module.get<AppraisalFormQuestionsController>(
      AppraisalFormQuestionsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
