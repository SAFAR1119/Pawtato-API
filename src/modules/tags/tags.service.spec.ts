import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Types } from 'mongoose';

import { TagsService } from './tags.service';
import { Tag } from './schemas/tag.schema';
import { PetsService } from '../pets/pets.service';
import { QrService } from '../qr/qr.service';
import { ActivityService } from '../activity/activity.service';
import { TagStatus } from '../../common/enums/tag-status.enum';

describe('TagsService', () => {
  let service: TagsService;
  let tagModel: {
    create: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    findById: jest.Mock;
    findByIdAndDelete: jest.Mock;
    distinct: jest.Mock;
    deleteMany: jest.Mock;
  };
  let petsService: { findOwnedPet: jest.Mock; findByIdAdmin: jest.Mock };
  let qrService: { generate: jest.Mock; delete: jest.Mock };
  let activityService: { log: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  const ownerId = new Types.ObjectId().toString();
  const otherOwnerId = new Types.ObjectId().toString();

  function makeTag(overrides: Record<string, unknown> = {}) {
    return {
      _id: new Types.ObjectId(),
      publicCode: 'ABC123',
      linkUrl: 'https://pawtato.ariyan.app/qr/ABC123',
      qrImageUrl: '/uploads/qrcodes/ABC123.png',
      ownerId: new Types.ObjectId(ownerId),
      status: TagStatus.AVAILABLE,
      assignedPetId: null,
      save: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  beforeEach(async () => {
    tagModel = {
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
      findByIdAndDelete: jest.fn(),
      distinct: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    petsService = { findOwnedPet: jest.fn(), findByIdAdmin: jest.fn() };
    qrService = {
      generate: jest.fn().mockResolvedValue('/uploads/qrcodes/ABC123.png'),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    activityService = { log: jest.fn().mockResolvedValue(undefined) };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagsService,
        { provide: getModelToken(Tag.name), useValue: tagModel },
        { provide: PetsService, useValue: petsService },
        { provide: QrService, useValue: qrService },
        { provide: ActivityService, useValue: activityService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<TagsService>(TagsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('builds the link from the caller-supplied base + generated code, and owns it to the caller', async () => {
      tagModel.create.mockImplementation((doc: Record<string, unknown>) =>
        Promise.resolve(doc),
      );

      const tag = await service.create(ownerId, {
        redirectBaseUrl: 'https://pawtato.ariyan.app/qr/',
      });

      expect(qrService.generate).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringMatching(
          /^https:\/\/pawtato\.ariyan\.app\/qr\/[A-Za-z0-9_-]+$/,
        ),
      );
      expect(tagModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: TagStatus.AVAILABLE,
          ownerId: expect.any(Types.ObjectId) as Types.ObjectId,
        }),
      );
      expect((tag as { linkUrl: string }).linkUrl).toMatch(
        /^https:\/\/pawtato\.ariyan\.app\/qr\//,
      );
    });

    it('normalizes a trailing slash so the link never ends up with a double slash', async () => {
      tagModel.create.mockImplementation((doc: Record<string, unknown>) =>
        Promise.resolve(doc),
      );

      await service.create(ownerId, {
        redirectBaseUrl: 'https://pawtato.ariyan.app/qr///',
      });

      const [, linkUrl] = qrService.generate.mock.calls[0] as [string, string];
      expect(linkUrl.includes('//qr//')).toBe(false);
    });

    it('retries with a fresh code on a publicCode collision instead of failing the request', async () => {
      const duplicateKeyError = Object.assign(new Error('E11000'), {
        code: 11000,
      });
      tagModel.create
        .mockRejectedValueOnce(duplicateKeyError)
        .mockImplementationOnce((doc: Record<string, unknown>) =>
          Promise.resolve(doc),
        );

      const tag = await service.create(ownerId, {
        redirectBaseUrl: 'https://pawtato.ariyan.app/qr/',
      });

      expect(tagModel.create).toHaveBeenCalledTimes(2);
      expect(qrService.generate).toHaveBeenCalledTimes(2);
      expect(qrService.delete).toHaveBeenCalledTimes(1);
      expect(tag).toBeDefined();
    });

    it('does not mask a non-collision failure behind a retry', async () => {
      tagModel.create.mockRejectedValue(new Error('database is down'));

      await expect(
        service.create(ownerId, {
          redirectBaseUrl: 'https://pawtato.ariyan.app/qr/',
        }),
      ).rejects.toThrow('database is down');
      expect(tagModel.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('findMine', () => {
    it('returns every tag owned by the caller regardless of status', async () => {
      const sort = jest.fn().mockResolvedValue([makeTag()]);
      tagModel.find.mockReturnValue({ sort });

      await service.findMine(ownerId);

      expect(tagModel.find).toHaveBeenCalledWith({
        ownerId: expect.any(Types.ObjectId) as Types.ObjectId,
      });
    });
  });

  describe('assign', () => {
    it('rejects assigning a tag the caller does not own', async () => {
      tagModel.findOne.mockResolvedValue(makeTag());

      await expect(
        service.assign(
          otherOwnerId,
          { publicCode: 'ABC123', petId: 'p1' },
          false,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows an admin to assign a tag they do not own', async () => {
      const tag = makeTag();
      tagModel.findOne
        .mockResolvedValueOnce(tag) // tag lookup
        .mockResolvedValueOnce(null); // no existing active tag on the pet
      petsService.findOwnedPet.mockResolvedValue({
        _id: new Types.ObjectId(),
        name: 'Fido',
      });

      await service.assign(
        otherOwnerId,
        { publicCode: 'ABC123', petId: 'p1' },
        true,
      );

      expect(tag.status).toBe(TagStatus.ASSIGNED);
    });

    it('rejects assigning a tag that is not AVAILABLE (e.g. already assigned)', async () => {
      tagModel.findOne.mockResolvedValue(
        makeTag({
          status: TagStatus.ASSIGNED,
          assignedPetId: new Types.ObjectId(),
        }),
      );

      await expect(
        service.assign(ownerId, { publicCode: 'ABC123', petId: 'p1' }, false),
      ).rejects.toThrow(BadRequestException);
      expect(petsService.findOwnedPet).not.toHaveBeenCalled();
    });

    it('rejects assigning a suspended/retired tag', async () => {
      tagModel.findOne.mockResolvedValue(
        makeTag({ status: TagStatus.RETIRED }),
      );

      await expect(
        service.assign(ownerId, { publicCode: 'ABC123', petId: 'p1' }, false),
      ).rejects.toThrow('This tag is not available for assignment');
    });

    it('enforces at most one active tag per pet: rejects when the target pet already has an ASSIGNED tag', async () => {
      const tag = makeTag();
      const pet = { _id: new Types.ObjectId(), name: 'Fido' };
      tagModel.findOne
        .mockResolvedValueOnce(tag) // tag lookup
        .mockResolvedValueOnce(makeTag({ status: TagStatus.ASSIGNED })); // an existing active tag on the pet
      petsService.findOwnedPet.mockResolvedValue(pet);

      await expect(
        service.assign(ownerId, { publicCode: 'ABC123', petId: 'p1' }, false),
      ).rejects.toThrow(
        'This pet already has an active tag. Unassign it before assigning a new one.',
      );
      expect(tag.status).toBe(TagStatus.AVAILABLE);
      expect(tag.save).not.toHaveBeenCalled();
    });

    it('assigns successfully, stamping assignedAt and emitting tag.assigned', async () => {
      const tag = makeTag();
      const pet = { _id: new Types.ObjectId(), name: 'Fido' };
      tagModel.findOne.mockResolvedValueOnce(tag).mockResolvedValueOnce(null);
      petsService.findOwnedPet.mockResolvedValue(pet);

      const result = await service.assign(
        ownerId,
        { publicCode: 'ABC123', petId: 'p1' },
        false,
      );

      expect(result.status).toBe(TagStatus.ASSIGNED);
      expect(result.assignedPetId).toBe(pet._id);
      expect(tag.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'tag.assigned',
        expect.objectContaining({ petId: pet._id.toString() }),
      );
      expect(activityService.log).toHaveBeenCalledWith(
        ownerId,
        'tag.assigned',
        expect.any(String),
        expect.objectContaining({ petId: pet._id.toString() }),
      );
    });
  });

  describe('unassign', () => {
    it('rejects unassigning a tag the caller does not own', async () => {
      tagModel.findOne.mockResolvedValue(
        makeTag({
          status: TagStatus.ASSIGNED,
          assignedPetId: new Types.ObjectId(),
        }),
      );

      await expect(
        service.unassign(otherOwnerId, { publicCode: 'ABC123' }, false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects unassigning a tag that is not currently assigned', async () => {
      tagModel.findOne.mockResolvedValue(
        makeTag({ status: TagStatus.AVAILABLE }),
      );

      await expect(
        service.unassign(ownerId, { publicCode: 'ABC123' }, false),
      ).rejects.toThrow(BadRequestException);
    });

    it('frees the tag back to AVAILABLE and emits tag.unassigned', async () => {
      const assignedPetId = new Types.ObjectId();
      const tag = makeTag({
        status: TagStatus.ASSIGNED,
        assignedPetId,
      });
      tagModel.findOne.mockResolvedValue(tag);
      petsService.findByIdAdmin.mockResolvedValue({
        _id: assignedPetId,
        name: 'Fido',
        owner: ownerId,
      });

      const result = await service.unassign(
        ownerId,
        { publicCode: 'ABC123' },
        false,
      );

      expect(result.status).toBe(TagStatus.AVAILABLE);
      expect(result.assignedPetId).toBeNull();
      expect(tag.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'tag.unassigned',
        expect.objectContaining({ petId: assignedPetId.toString() }),
      );
    });
  });

  describe('delete', () => {
    it('rejects deleting a tag the caller does not own', async () => {
      tagModel.findById.mockResolvedValue(makeTag());

      await expect(
        service.delete(otherOwnerId, 'tag-id', false),
      ).rejects.toThrow(ForbiddenException);
      expect(qrService.delete).not.toHaveBeenCalled();
    });

    it('deletes the tag and its QR image when the caller owns it', async () => {
      const tag = makeTag();
      tagModel.findById.mockResolvedValue(tag);

      const result = await service.delete(ownerId, 'tag-id', false);

      expect(qrService.delete).toHaveBeenCalledWith(tag.publicCode);
      expect(tagModel.findByIdAndDelete).toHaveBeenCalledWith(tag._id);
      expect(result).toEqual({ message: 'Tag deleted successfully' });
    });

    it('unassigns from the pet as part of deleting a currently-linked tag', async () => {
      const petId = new Types.ObjectId();
      const tag = makeTag({ status: TagStatus.ASSIGNED, assignedPetId: petId });
      tagModel.findById.mockResolvedValue(tag);
      petsService.findByIdAdmin.mockResolvedValue({
        _id: petId,
        name: 'Fido',
        owner: ownerId,
      });

      await service.delete(ownerId, 'tag-id', false);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'tag.unassigned',
        expect.objectContaining({ petId: petId.toString() }),
      );
    });

    it('throws NotFoundException for an unknown tag id', async () => {
      tagModel.findById.mockResolvedValue(null);

      await expect(service.delete(ownerId, 'missing', false)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOwnedById', () => {
    it('returns the tag when the caller owns it', async () => {
      const tag = makeTag();
      tagModel.findById.mockResolvedValue(tag);

      await expect(
        service.findOwnedById(ownerId, 'tag-id', false),
      ).resolves.toBe(tag);
    });

    it('rejects when the caller does not own it and is not an admin', async () => {
      tagModel.findById.mockResolvedValue(makeTag());

      await expect(
        service.findOwnedById(otherOwnerId, 'tag-id', false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows an admin regardless of ownership', async () => {
      const tag = makeTag();
      tagModel.findById.mockResolvedValue(tag);

      await expect(
        service.findOwnedById(otherOwnerId, 'tag-id', true),
      ).resolves.toBe(tag);
    });
  });

  describe('suspend/retire lifecycle', () => {
    const adminId = new Types.ObjectId().toString();

    it('suspends an available/assigned tag and logs it', async () => {
      const tag = makeTag();
      tagModel.findById.mockResolvedValue(tag);

      const result = await service.suspend('tag-id', adminId);

      expect(result.status).toBe(TagStatus.SUSPENDED);
      expect(tag.save).toHaveBeenCalled();
      expect(activityService.log).toHaveBeenCalledWith(
        adminId,
        'tag.suspended',
        expect.any(String),
        expect.objectContaining({ publicCode: tag.publicCode }),
      );
    });

    it('rejects suspending an already-retired tag', async () => {
      tagModel.findById.mockResolvedValue(
        makeTag({ status: TagStatus.RETIRED }),
      );

      await expect(service.suspend('tag-id', adminId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('retire clears any active assignment and logs it', async () => {
      const tag = makeTag({
        status: TagStatus.ASSIGNED,
        assignedPetId: new Types.ObjectId(),
      });
      tagModel.findById.mockResolvedValue(tag);

      const result = await service.retire('tag-id', adminId);

      expect(result.status).toBe(TagStatus.RETIRED);
      expect(result.assignedPetId).toBeNull();
      expect(activityService.log).toHaveBeenCalledWith(
        adminId,
        'tag.retired',
        expect.any(String),
        expect.objectContaining({ publicCode: tag.publicCode }),
      );
    });
  });

  describe('bulkCreate', () => {
    it('manufactures `count` unowned tags in MANUFACTURED status and logs one batch entry', async () => {
      const adminId = new Types.ObjectId().toString();
      tagModel.create.mockImplementation((doc: Record<string, unknown>) =>
        Promise.resolve({ _id: new Types.ObjectId(), ...doc }),
      );

      const tags = await service.bulkCreate(adminId, {
        count: 3,
        redirectBaseUrl: 'https://pawtato.ariyan.app/qr/',
        batchLabel: 'batch-1',
      });

      expect(tags).toHaveLength(3);
      expect(tagModel.create).toHaveBeenCalledTimes(3);
      expect(tagModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: TagStatus.MANUFACTURED,
          batchLabel: 'batch-1',
        }),
      );
      expect(
        (tagModel.create.mock.calls[0] as [Record<string, unknown>])[0],
      ).not.toHaveProperty('ownerId');
      expect(activityService.log).toHaveBeenCalledTimes(1);
      expect(activityService.log).toHaveBeenCalledWith(
        adminId,
        'tag.bulk-created',
        'Tag',
        expect.objectContaining({ count: 3, batchLabel: 'batch-1' }),
      );
    });
  });

  describe('claim', () => {
    const userId = new Types.ObjectId().toString();

    it('claims an unowned MANUFACTURED tag into the caller, setting it AVAILABLE', async () => {
      const tag = makeTag({
        status: TagStatus.MANUFACTURED,
        ownerId: null,
      });
      tagModel.findOne.mockResolvedValue(tag);

      const result = await service.claim(userId, { publicCode: 'ABC123' });

      expect(result.status).toBe(TagStatus.AVAILABLE);
      expect(result.ownerId.toString()).toBe(userId);
      expect(tag.save).toHaveBeenCalled();
      expect(activityService.log).toHaveBeenCalledWith(
        userId,
        'tag.claimed',
        expect.any(String),
        { publicCode: 'ABC123' },
      );
    });

    it('rejects claiming a tag that already has an owner', async () => {
      tagModel.findOne.mockResolvedValue(
        makeTag({ status: TagStatus.MANUFACTURED }),
      );

      await expect(
        service.claim(userId, { publicCode: 'ABC123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects claiming a tag that is not MANUFACTURED (e.g. already AVAILABLE)', async () => {
      tagModel.findOne.mockResolvedValue(
        makeTag({ status: TagStatus.AVAILABLE, ownerId: null }),
      );

      await expect(
        service.claim(userId, { publicCode: 'ABC123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for an unknown public code', async () => {
      tagModel.findOne.mockResolvedValue(null);

      await expect(
        service.claim(userId, { publicCode: 'MISSING' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cascade delete helpers', () => {
    describe('findIdsForOwner / findIdsForPet', () => {
      it('returns owned tag ids as strings', async () => {
        const id = new Types.ObjectId();
        tagModel.distinct.mockResolvedValue([id]);

        const result = await service.findIdsForOwner(ownerId);

        expect(tagModel.distinct).toHaveBeenCalledWith('_id', {
          ownerId: new Types.ObjectId(ownerId),
        });
        expect(result).toEqual([id.toString()]);
      });

      it('returns the ids of tags assigned to a given pet', async () => {
        const id = new Types.ObjectId();
        const petId = new Types.ObjectId().toString();
        tagModel.distinct.mockResolvedValue([id]);

        const result = await service.findIdsForPet(petId);

        expect(tagModel.distinct).toHaveBeenCalledWith('_id', {
          assignedPetId: new Types.ObjectId(petId),
        });
        expect(result).toEqual([id.toString()]);
      });
    });

    describe('deleteAllForOwner / deleteAllForPet', () => {
      it('deletes every owned tag along with its QR image, without emitting any domain event', async () => {
        const tags = [makeTag(), makeTag({ publicCode: 'XYZ789' })];
        tagModel.find.mockResolvedValue(tags);

        const result = await service.deleteAllForOwner(ownerId);

        expect(tagModel.find).toHaveBeenCalledWith({
          ownerId: new Types.ObjectId(ownerId),
        });
        expect(qrService.delete).toHaveBeenCalledWith('ABC123');
        expect(qrService.delete).toHaveBeenCalledWith('XYZ789');
        expect(tagModel.deleteMany).toHaveBeenCalledWith({
          ownerId: new Types.ObjectId(ownerId),
        });
        expect(eventEmitter.emit).not.toHaveBeenCalled();
        expect(result).toEqual({ deletedCount: 2 });
      });

      it('scopes deleteAllForPet to only the tag(s) assigned to that pet', async () => {
        const petId = new Types.ObjectId().toString();
        tagModel.find.mockResolvedValue([makeTag()]);

        await service.deleteAllForPet(petId);

        expect(tagModel.find).toHaveBeenCalledWith({
          assignedPetId: new Types.ObjectId(petId),
        });
        expect(tagModel.deleteMany).toHaveBeenCalledWith({
          assignedPetId: new Types.ObjectId(petId),
        });
      });

      it('still deletes the tag documents even when a QR image fails to delete', async () => {
        tagModel.find.mockResolvedValue([makeTag()]);
        qrService.delete.mockRejectedValue(new Error('storage down'));

        const result = await service.deleteAllForOwner(ownerId);

        expect(tagModel.deleteMany).toHaveBeenCalled();
        expect(result).toEqual({ deletedCount: 1 });
      });
    });
  });
});
