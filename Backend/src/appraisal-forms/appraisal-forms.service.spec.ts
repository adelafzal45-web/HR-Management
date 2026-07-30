import { Test, TestingModule } from '@nestjs/testing';
import { AppraisalFormsService } from './appraisal-forms.service';

describe('AppraisalFormsService', () => {
  let service: AppraisalFormsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppraisalFormsService],
    }).compile();

    service = module.get<AppraisalFormsService>(AppraisalFormsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
