import { Test, TestingModule } from '@nestjs/testing';
import { IdentityVerificationController } from './identity-verification.controller';
import { IdentityVerificationService } from './identity-verification.service';

describe('IdentityVerificationController', () => {
  let controller: IdentityVerificationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IdentityVerificationController],
      providers: [{ provide: IdentityVerificationService, useValue: {} }],
    }).compile();

    controller = module.get<IdentityVerificationController>(
      IdentityVerificationController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
