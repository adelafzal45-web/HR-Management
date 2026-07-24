import { Test, TestingModule } from '@nestjs/testing';
import { AppraisalQuestionService } from './appraisal-question.service';

describe('AppraisalQuestionService', () => {
  let service: AppraisalQuestionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppraisalQuestionService],
    }).compile();

    service = module.get<AppraisalQuestionService>(AppraisalQuestionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
