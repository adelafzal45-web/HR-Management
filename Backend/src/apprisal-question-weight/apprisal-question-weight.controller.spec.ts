import { Test, TestingModule } from '@nestjs/testing';
import { ApprisalQuestionWeightController } from './apprisal-question-weight.controller';

describe('ApprisalQuestionWeightController', () => {
  let controller: ApprisalQuestionWeightController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApprisalQuestionWeightController],
    }).compile();

    controller = module.get<ApprisalQuestionWeightController>(ApprisalQuestionWeightController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
