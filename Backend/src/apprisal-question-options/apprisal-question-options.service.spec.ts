import { Test, TestingModule } from '@nestjs/testing';
import { ApprisalQuestionOptionsService } from './apprisal-question-options.service';

describe('ApprisalQuestionOptionsService', () => {
  let service: ApprisalQuestionOptionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApprisalQuestionOptionsService],
    }).compile();

    service = module.get<ApprisalQuestionOptionsService>(ApprisalQuestionOptionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
