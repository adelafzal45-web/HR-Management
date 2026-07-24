import { Test, TestingModule } from '@nestjs/testing';
import { JobCategoriesController } from './job-categories.controller';

describe('JobCategoriesController', () => {
  let controller: JobCategoriesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobCategoriesController],
    }).compile();

    controller = module.get<JobCategoriesController>(JobCategoriesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
