import { Test, TestingModule } from '@nestjs/testing';

import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

describe('ActivityController', () => {
  let controller: ActivityController;
  let activityService: { findAll: jest.Mock };

  beforeEach(async () => {
    activityService = {
      findAll: jest.fn().mockResolvedValue({ activities: [], pagination: {} }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ActivityController],
      providers: [{ provide: ActivityService, useValue: activityService }],
    }).compile();

    controller = module.get<ActivityController>(ActivityController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll delegates to ActivityService.findAll with the query', async () => {
    const query = { page: 1, limit: 20 };

    await controller.findAll(query);

    expect(activityService.findAll).toHaveBeenCalledWith(query);
  });
});
