import { Test, TestingModule } from '@nestjs/testing';
import { PerformanceReviewAnswerController } from './performance-review-answer.controller';

describe('PerformanceReviewAnswerController', () => {
  let controller: PerformanceReviewAnswerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PerformanceReviewAnswerController],
    }).compile();

    controller = module.get<PerformanceReviewAnswerController>(
      PerformanceReviewAnswerController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
