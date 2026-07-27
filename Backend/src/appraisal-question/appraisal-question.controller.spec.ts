import { Test, TestingModule } from '@nestjs/testing';
import { AppraisalQuestionController } from './appraisal-question.controller';

describe('AppraisalQuestionController', () => {
  let controller: AppraisalQuestionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppraisalQuestionController],
    }).compile();

    controller = module.get<AppraisalQuestionController>(
      AppraisalQuestionController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
