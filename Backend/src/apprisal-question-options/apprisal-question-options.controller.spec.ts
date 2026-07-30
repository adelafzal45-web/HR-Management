import { Test, TestingModule } from '@nestjs/testing';
import { ApprisalQuestionOptionsController } from './apprisal-question-options.controller';

describe('ApprisalQuestionOptionsController', () => {
  let controller: ApprisalQuestionOptionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApprisalQuestionOptionsController],
    }).compile();

    controller = module.get<ApprisalQuestionOptionsController>(
      ApprisalQuestionOptionsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
