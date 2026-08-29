import { Test, TestingModule } from '@nestjs/testing';
import { PetDatingProfileController } from './pet-dating-profile.controller';
import { DatingService } from './dating.service';

describe('PetDatingProfileController', () => {
  let controller: PetDatingProfileController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PetDatingProfileController],
      providers: [{ provide: DatingService, useValue: {} }],
    }).compile();

    controller = module.get<PetDatingProfileController>(
      PetDatingProfileController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
