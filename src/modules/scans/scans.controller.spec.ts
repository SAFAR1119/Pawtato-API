import { Test, TestingModule } from '@nestjs/testing';
import { ScansController } from './scans.controller';
import { ScansService } from './scans.service';

describe('ScansController', () => {
  let controller: ScansController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScansController],
      providers: [{ provide: ScansService, useValue: {} }],
    }).compile();

    controller = module.get<ScansController>(ScansController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
