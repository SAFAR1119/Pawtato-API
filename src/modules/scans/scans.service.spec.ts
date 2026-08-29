import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Types } from 'mongoose';

import { ScansService } from './scans.service';
import { ScanEvent } from './schemas/scan-event.schema';
import { PetsService } from '../pets/pets.service';
import { DOMAIN_EVENTS } from '../../common/events/domain-events';

describe('ScansService', () => {
  let service: ScansService;
  let scanEventModel: {
    create: jest.Mock;
    find: jest.Mock;
    deleteMany: jest.Mock;
  };
  let petsService: { findAccessiblePet: jest.Mock; findWithOwner: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  const tagId = new Types.ObjectId();
  const petId = new Types.ObjectId();

  beforeEach(async () => {
    scanEventModel = {
      create: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      find: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    petsService = { findAccessiblePet: jest.fn(), findWithOwner: jest.fn() };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScansService,
        { provide: getModelToken(ScanEvent.name), useValue: scanEventModel },
        { provide: PetsService, useValue: petsService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<ScansService>(ScansService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('record', () => {
    it('persists a ScanEvent even when the tag is not linked to a pet', async () => {
      await service.record(tagId, null, 'CODE1', 'Mozilla/5.0');

      expect(scanEventModel.create).toHaveBeenCalledWith({
        tag: tagId,
        pet: null,
        userAgent: 'Mozilla/5.0',
      });
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('emits qr.tag-scanned only when the scan resolves to an assigned pet', async () => {
      petsService.findWithOwner.mockResolvedValue({
        name: 'Milo',
        isLost: true,
        owner: { _id: new Types.ObjectId() },
      });

      await service.record(tagId, petId, 'CODE1', 'Mozilla/5.0');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.QR_TAG_SCANNED,
        expect.objectContaining({ petId: petId.toString(), isLost: true }),
      );
    });

    it('does not fail the scan when the owner lookup for the event throws', async () => {
      petsService.findWithOwner.mockRejectedValue(new Error('db down'));

      await expect(
        service.record(tagId, petId, 'CODE1'),
      ).resolves.toBeDefined();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('does not emit when the resolved pet has no populated owner', async () => {
      petsService.findWithOwner.mockResolvedValue({
        name: 'Milo',
        owner: undefined,
      });

      await service.record(tagId, petId, 'CODE1');

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('findForOwnedPet', () => {
    it('enforces ownership via PetsService before returning scan history', async () => {
      const ownerId = new Types.ObjectId().toString();
      const petIdStr = petId.toString();
      const sort = jest.fn().mockResolvedValue([]);
      scanEventModel.find.mockReturnValue({ sort });

      await service.findForOwnedPet(ownerId, petIdStr);

      expect(petsService.findAccessiblePet).toHaveBeenCalledWith(
        ownerId,
        petIdStr,
      );
      expect(scanEventModel.find).toHaveBeenCalledWith({
        pet: new Types.ObjectId(petIdStr),
      });
    });

    it('propagates the NotFoundException when the caller does not own the pet', async () => {
      const notOwned = new Error('Pet not found');
      petsService.findAccessiblePet.mockRejectedValue(notOwned);

      await expect(
        service.findForOwnedPet('someone-else', petId.toString()),
      ).rejects.toThrow(notOwned);
      expect(scanEventModel.find).not.toHaveBeenCalled();
    });
  });

  describe('deleteAllForPetsAndTags', () => {
    it('deletes every scan event matching either the given pets or tags', async () => {
      scanEventModel.deleteMany.mockResolvedValue({ deletedCount: 5 });

      const result = await service.deleteAllForPetsAndTags(
        [petId.toString()],
        [tagId.toString()],
      );

      expect(scanEventModel.deleteMany).toHaveBeenCalledWith({
        $or: [{ pet: { $in: [petId] } }, { tag: { $in: [tagId] } }],
      });
      expect(result).toEqual({ deletedCount: 5 });
    });

    it('skips the query entirely when both id lists are empty', async () => {
      const result = await service.deleteAllForPetsAndTags([], []);

      expect(scanEventModel.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({ deletedCount: 0 });
    });
  });
});
