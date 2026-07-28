import { Test, TestingModule } from '@nestjs/testing';
import { ApprisalQuestionWeightService } from './apprisal-question-weight.service';

describe('ApprisalQuestionWeightService', () => {
  let service: ApprisalQuestionWeightService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApprisalQuestionWeightService],
    }).compile();

    service = module.get<ApprisalQuestionWeightService>(ApprisalQuestionWeightService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
