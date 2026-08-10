import { Test, TestingModule } from '@nestjs/testing';
import { ReimbursementsService } from './reimbursements.service';

describe('ReimbursementsService', () => {
  let service: ReimbursementsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReimbursementsService],
    }).compile();

    service = module.get<ReimbursementsService>(ReimbursementsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
