import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';

import { ActivityService } from './activity.service';
import { Activity } from './schemas/activity.schema';

describe('ActivityService', () => {
  let service: ActivityService;
  let activityModel: {
    create: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
  };

  const actorId = new Types.ObjectId().toString();

  beforeEach(async () => {
    activityModel = {
      create: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityService,
        { provide: getModelToken(Activity.name), useValue: activityModel },
      ],
    }).compile();

    service = module.get<ActivityService>(ActivityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('log', () => {
    it('persists actor (cast to ObjectId) /action/target/metadata', async () => {
      activityModel.create.mockResolvedValue({});

      await service.log(actorId, 'admin.user.blocked', 'user-1', {
        reason: 'abuse',
      });

      expect(activityModel.create).toHaveBeenCalledWith({
        actor: new Types.ObjectId(actorId),
        action: 'admin.user.blocked',
        // `target` is deliberately left as a plain string — a generic
        // label (petId/tagId/reportId/...), not a single-collection ref.
        target: 'user-1',
        metadata: { reason: 'abuse' },
      });
    });

    it('defaults metadata to an empty object when omitted', async () => {
      activityModel.create.mockResolvedValue({});

      await service.log(actorId, 'tag.assigned', 'tag-1');

      expect(activityModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: {} }),
      );
    });
  });

  describe('findAll', () => {
    it('paginates and filters by actor (cast to ObjectId) /action when provided', async () => {
      const limit = jest.fn().mockResolvedValue([]);
      const skip = jest.fn().mockReturnValue({ limit });
      const sort = jest.fn().mockReturnValue({ skip });
      const populate = jest.fn().mockReturnValue({ sort });
      activityModel.find.mockReturnValue({ populate });

      const result = await service.findAll({
        page: 2,
        limit: 5,
        actor: actorId,
        action: 'tag.suspended',
      });

      expect(activityModel.find).toHaveBeenCalledWith({
        actor: new Types.ObjectId(actorId),
        action: 'tag.suspended',
      });
      expect(skip).toHaveBeenCalledWith(5);
      expect(limit).toHaveBeenCalledWith(5);
      expect(result.pagination).toEqual({
        total: 0,
        page: 2,
        limit: 5,
        totalPages: 0,
      });
    });

    it('applies no filter when actor/action are omitted', async () => {
      const limit = jest.fn().mockResolvedValue([]);
      const skip = jest.fn().mockReturnValue({ limit });
      const sort = jest.fn().mockReturnValue({ skip });
      const populate = jest.fn().mockReturnValue({ sort });
      activityModel.find.mockReturnValue({ populate });

      await service.findAll({ page: 1, limit: 20 });

      expect(activityModel.find).toHaveBeenCalledWith({});
    });
  });
});
