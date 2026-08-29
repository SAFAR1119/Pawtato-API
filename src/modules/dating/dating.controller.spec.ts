import { Test, TestingModule } from '@nestjs/testing';
import { DatingController } from './dating.controller';
import { DatingService } from './dating.service';

describe('DatingController', () => {
  let controller: DatingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DatingController],
      providers: [{ provide: DatingService, useValue: {} }],
    }).compile();

    controller = module.get<DatingController>(DatingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
