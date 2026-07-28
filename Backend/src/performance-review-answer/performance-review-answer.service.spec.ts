import { Test, TestingModule } from '@nestjs/testing';
import { PerformanceReviewAnswerService } from './performance-review-answer.service';

describe('PerformanceReviewAnswerService', () => {
  let service: PerformanceReviewAnswerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PerformanceReviewAnswerService],
    }).compile();

    service = module.get<PerformanceReviewAnswerService>(PerformanceReviewAnswerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
