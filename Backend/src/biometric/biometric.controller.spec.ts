import { Test, TestingModule } from '@nestjs/testing';
import { BiometricController } from './biometric.controller';

describe('BiometricController', () => {
  let controller: BiometricController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BiometricController],
    }).compile();

    controller = module.get<BiometricController>(BiometricController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
