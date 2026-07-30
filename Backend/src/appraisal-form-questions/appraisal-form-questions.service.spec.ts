import { Test, TestingModule } from '@nestjs/testing';
import { AppraisalFormQuestionsService } from './appraisal-form-questions.service';

describe('AppraisalFormQuestionsService', () => {
  let service: AppraisalFormQuestionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppraisalFormQuestionsService],
    }).compile();

    service = module.get<AppraisalFormQuestionsService>(
      AppraisalFormQuestionsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
