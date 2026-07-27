import { Test, TestingModule } from '@nestjs/testing';
import { PerformanceReviewController } from './performance-review.controller';

describe('PerformanceReviewController', () => {
  let controller: PerformanceReviewController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PerformanceReviewController],
    }).compile();

    controller = module.get<PerformanceReviewController>(
      PerformanceReviewController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
