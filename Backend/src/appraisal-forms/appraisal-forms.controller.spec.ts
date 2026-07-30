import { Test, TestingModule } from '@nestjs/testing';
import { AppraisalFormsController } from './appraisal-forms.controller';
import { AppraisalFormsService } from './appraisal-forms.service';

describe('AppraisalFormsController', () => {
  let controller: AppraisalFormsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppraisalFormsController],
      providers: [AppraisalFormsService],
    }).compile();

    controller = module.get<AppraisalFormsController>(AppraisalFormsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
