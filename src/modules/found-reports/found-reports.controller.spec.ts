import { Test, TestingModule } from '@nestjs/testing';
import { FoundReportsController } from './found-reports.controller';
import { FoundReportsService } from './found-reports.service';

describe('FoundReportsController', () => {
  let controller: FoundReportsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FoundReportsController],
      providers: [{ provide: FoundReportsService, useValue: {} }],
    }).compile();

    controller = module.get<FoundReportsController>(FoundReportsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
