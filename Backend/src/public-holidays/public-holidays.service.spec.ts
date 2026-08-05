import { Test, TestingModule } from '@nestjs/testing';
import { PublicHolidaysService } from './public-holidays.service';

describe('PublicHolidaysService', () => {
  let service: PublicHolidaysService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PublicHolidaysService],
    }).compile();

    service = module.get<PublicHolidaysService>(PublicHolidaysService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
