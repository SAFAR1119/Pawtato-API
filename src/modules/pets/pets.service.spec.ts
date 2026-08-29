import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Types } from 'mongoose';
import { PetsService } from './pets.service';
import { Pet } from './schemas/pet.schema';
import { PetCaretaker } from '../caretakers/schemas/pet-caretaker.schema';
import { DOMAIN_EVENTS } from '../../common/events/domain-events';
import { STORAGE_PROVIDER } from '../storage/storage.constants';
import { ActivityService } from '../activity/activity.service';

describe('PetsService', () => {
  let service: PetsService;
  let petModel: {
    findOneAndUpdate: jest.Mock;
    findOne: jest.Mock;
    findById: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    findOneAndDelete: jest.Mock;
    findByIdAndDelete: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    distinct: jest.Mock;
    deleteMany: jest.Mock;
  };
  let caretakerModel: { exists: jest.Mock };
  let storageProvider: { deleteByUrl: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let activityService: { log: jest.Mock };

  const ownerId = new Types.ObjectId().toString();
  const otherOwnerId = new Types.ObjectId().toString();
  const petId = new Types.ObjectId().toString();

  beforeEach(async () => {
    petModel = {
      findOneAndUpdate: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findOneAndDelete: jest.fn(),
      findByIdAndDelete: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      distinct: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    caretakerModel = { exists: jest.fn().mockResolvedValue(null) };
    storageProvider = {
      deleteByUrl: jest.fn().mockResolvedValue(undefined),
    };
    eventEmitter = { emit: jest.fn() };
    activityService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PetsService,
        { provide: getModelToken(Pet.name), useValue: petModel },
        {
          provide: getModelToken(PetCaretaker.name),
          useValue: caretakerModel,
        },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: ActivityService, useValue: activityService },
        { provide: STORAGE_PROVIDER, useValue: storageProvider },
      ],
    }).compile();

    service = module.get<PetsService>(PetsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Ownership enforcement: `update`/`remove` scope the query to
  // `{ _id: petId, owner: ownerId }` — a caller supplying another user's
  // petId must get the exact same "not found" as a nonexistent id, never a
  // 403 that would confirm the id belongs to someone else. `findOne`/
  // `reportLost`/`reportFound` are exercised separately below, since Phase
  // 15 changed their authorization to findAccessiblePet (owner OR caretaker).
  describe('ownership enforcement', () => {
    it('findOwnedPet throws NotFoundException for a pet owned by someone else', async () => {
      petModel.findOne.mockResolvedValue(null);

      await expect(service.findOwnedPet(otherOwnerId, petId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("update throws NotFoundException rather than updating another owner's pet", async () => {
      petModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.update(otherOwnerId, petId, { name: 'Hijacked' }),
      ).rejects.toThrow(NotFoundException);
      expect(petModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: petId, owner: new Types.ObjectId(otherOwnerId) },
        { name: 'Hijacked' },
        { new: true },
      );
    });

    it("remove throws NotFoundException rather than deleting another owner's pet", async () => {
      petModel.findOneAndDelete.mockResolvedValue(null);

      await expect(service.remove(otherOwnerId, petId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('findAll only ever queries pets scoped to the caller', async () => {
      const sort = jest.fn().mockResolvedValue([]);
      petModel.find = jest.fn().mockReturnValue({ sort });

      await service.findAll(ownerId);

      expect(petModel.find).toHaveBeenCalledWith({
        owner: new Types.ObjectId(ownerId),
      });
    });
  });

  describe('lost/found status transitions', () => {
    function makePetDoc(overrides: Record<string, unknown> = {}) {
      return {
        _id: petId,
        name: 'Milo',
        isLost: false,
        populate: jest.fn().mockResolvedValue(undefined),
        owner: new Types.ObjectId(ownerId),
        ...overrides,
      };
    }

    it('reportLost sets isLost=true, stamps lostDate, and emits pet.marked-lost', async () => {
      const pet = makePetDoc();
      petModel.findById.mockResolvedValue(pet);
      petModel.findByIdAndUpdate.mockResolvedValue(pet);

      const dto = { lastSeenLocation: 'Dhanmondi', lostDescription: 'Ran off' };
      await service.reportLost(ownerId, petId, dto);

      expect(petModel.findByIdAndUpdate).toHaveBeenCalledWith(
        petId,
        expect.objectContaining({
          ...dto,
          isLost: true,
          lostDate: expect.any(Date) as Date,
        }),
        { new: true },
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.PET_MARKED_LOST,
        expect.objectContaining({ ownerId, petId, petName: 'Milo' }),
      );
      expect(activityService.log).toHaveBeenCalledWith(
        ownerId,
        DOMAIN_EVENTS.PET_MARKED_LOST,
        petId,
        { petName: 'Milo' },
      );
    });

    it('reportFound clears every lost-specific field and emits pet.marked-found', async () => {
      const pet = makePetDoc({ isLost: false });
      petModel.findById.mockResolvedValue(pet);
      petModel.findByIdAndUpdate.mockResolvedValue(pet);

      await service.reportFound(ownerId, petId);

      expect(petModel.findByIdAndUpdate).toHaveBeenCalledWith(
        petId,
        {
          isLost: false,
          lostDate: undefined,
          lastSeenLocation: undefined,
          lastSeenGeo: undefined,
          lostDescription: undefined,
          reward: undefined,
        },
        { new: true },
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.PET_MARKED_FOUND,
        expect.objectContaining({ ownerId, petId, petName: 'Milo' }),
      );
      expect(activityService.log).toHaveBeenCalledWith(
        ownerId,
        DOMAIN_EVENTS.PET_MARKED_FOUND,
        petId,
        { petName: 'Milo' },
      );
    });

    it('does not let a failed owner-email populate block the lost report from succeeding', async () => {
      const pet = makePetDoc({
        populate: jest.fn().mockRejectedValue(new Error('populate failed')),
      });
      petModel.findById.mockResolvedValue(pet);
      petModel.findByIdAndUpdate.mockResolvedValue(pet);

      await expect(service.reportLost(ownerId, petId, {})).resolves.toBe(pet);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(activityService.log).toHaveBeenCalled();
    });

    it('reportLost throws NotFoundException when the caller has no access to the pet', async () => {
      petModel.findById.mockResolvedValue(null);

      await expect(service.reportLost(otherOwnerId, petId, {})).rejects.toThrow(
        NotFoundException,
      );
      expect(petModel.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('reportFound throws NotFoundException when the caller has no access to the pet', async () => {
      petModel.findById.mockResolvedValue(null);

      await expect(service.reportFound(otherOwnerId, petId)).rejects.toThrow(
        NotFoundException,
      );
      expect(petModel.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('a caretaker (not the owner) can report the pet lost, and the notification still goes to the real owner', async () => {
      const pet = makePetDoc();
      petModel.findById.mockResolvedValue(pet);
      petModel.findByIdAndUpdate.mockResolvedValue(pet);
      caretakerModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });

      const caretakerId = new Types.ObjectId().toString();
      await service.reportLost(caretakerId, petId, {});

      expect(caretakerModel.exists).toHaveBeenCalledWith({
        petId: pet._id,
        userId: new Types.ObjectId(caretakerId),
      });
      // The owner-facing notification still names the real owner...
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.PET_MARKED_LOST,
        expect.objectContaining({ ownerId, petId }),
      );
      // ...but the audit-log entry records who actually performed it.
      expect(activityService.log).toHaveBeenCalledWith(
        caretakerId,
        DOMAIN_EVENTS.PET_MARKED_LOST,
        petId,
        { petName: 'Milo' },
      );
    });
  });

  // Phase 15 — shared pet access. findAccessiblePet() is the single
  // authorization checkpoint findOne/reportLost/reportFound and every
  // caretaking-relevant action in other modules (medical, vaccinations,
  // scans, found-reports) now go through.
  describe('findAccessiblePet (Phase 15 — shared pet access)', () => {
    it('throws NotFoundException for a pet that does not exist', async () => {
      petModel.findById.mockResolvedValue(null);

      await expect(service.findAccessiblePet(ownerId, petId)).rejects.toThrow(
        NotFoundException,
      );
      expect(caretakerModel.exists).not.toHaveBeenCalled();
    });

    it('returns the pet for its owner without ever querying caretakers', async () => {
      const pet = { _id: petId, owner: new Types.ObjectId(ownerId) };
      petModel.findById.mockResolvedValue(pet);

      const result = await service.findAccessiblePet(ownerId, petId);

      expect(result).toBe(pet);
      expect(caretakerModel.exists).not.toHaveBeenCalled();
    });

    it('returns the pet for an active caretaker who is not the owner', async () => {
      const pet = { _id: petId, owner: new Types.ObjectId(otherOwnerId) };
      petModel.findById.mockResolvedValue(pet);
      caretakerModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });

      const result = await service.findAccessiblePet(ownerId, petId);

      expect(result).toBe(pet);
      expect(caretakerModel.exists).toHaveBeenCalledWith({
        petId: pet._id,
        userId: new Types.ObjectId(ownerId),
      });
    });

    it('throws NotFoundException (never a distinguishing 403) for a caller who is neither the owner nor a caretaker', async () => {
      const pet = { _id: petId, owner: new Types.ObjectId(otherOwnerId) };
      petModel.findById.mockResolvedValue(pet);
      caretakerModel.exists.mockResolvedValue(null);

      await expect(service.findAccessiblePet(ownerId, petId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('findOne delegates directly to findAccessiblePet', async () => {
      const pet = { _id: petId, owner: new Types.ObjectId(ownerId) };
      petModel.findById.mockResolvedValue(pet);

      const result = await service.findOne(ownerId, petId);

      expect(result).toBe(pet);
      expect(petModel.findById).toHaveBeenCalledWith(petId);
    });
  });

  describe('updatePhoto', () => {
    it('scopes the update to the pet owned by the caller', async () => {
      petModel.findOne.mockReturnValue({
        select: jest
          .fn()
          .mockResolvedValue({ profileImage: '/uploads/pets/old.png' }),
      });
      petModel.findOneAndUpdate.mockResolvedValue({
        profileImage: '/uploads/pets/photo.png',
      });

      await service.updatePhoto(ownerId, petId, '/uploads/pets/photo.png');

      expect(petModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: petId }),
        { profileImage: '/uploads/pets/photo.png' },
        { new: true },
      );
      expect(storageProvider.deleteByUrl).toHaveBeenCalledWith(
        '/uploads/pets/old.png',
      );
    });

    it('throws NotFoundException when the pet is not owned by the caller', async () => {
      petModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.updatePhoto(ownerId, petId, '/uploads/pets/photo.png'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove / deletePet (file cleanup)', () => {
    it('remove deletes the stored photo after deleting the pet', async () => {
      petModel.findOneAndDelete.mockResolvedValue({
        _id: petId,
        profileImage: '/uploads/pets/photo.png',
      });

      const result = await service.remove(ownerId, petId);

      expect(storageProvider.deleteByUrl).toHaveBeenCalledWith(
        '/uploads/pets/photo.png',
      );
      expect(result).toEqual({ message: 'Pet deleted successfully' });
    });

    it('deletePet (admin) throws NotFoundException for an unknown pet', async () => {
      petModel.findByIdAndDelete.mockResolvedValue(null);

      await expect(service.deletePet(petId)).rejects.toThrow(NotFoundException);
      expect(storageProvider.deleteByUrl).not.toHaveBeenCalled();
    });

    it('deletePet (admin) deletes the stored photo after deleting the pet', async () => {
      petModel.findByIdAndDelete.mockResolvedValue({
        _id: petId,
        profileImage: '/uploads/pets/photo.png',
      });

      await service.deletePet(petId);

      expect(storageProvider.deleteByUrl).toHaveBeenCalledWith(
        '/uploads/pets/photo.png',
      );
    });
  });

  describe('cascade delete helpers (admin user-deletion)', () => {
    it('findIdsForOwner returns owned pet ids as strings', async () => {
      const id = new Types.ObjectId();
      petModel.distinct.mockResolvedValue([id]);

      const result = await service.findIdsForOwner(ownerId);

      expect(petModel.distinct).toHaveBeenCalledWith('_id', {
        owner: new Types.ObjectId(ownerId),
      });
      expect(result).toEqual([id.toString()]);
    });

    it('deleteAllForOwner deletes every photo before deleting the pet documents', async () => {
      const select = jest
        .fn()
        .mockResolvedValue([
          { profileImage: '/uploads/pets/one.png' },
          { profileImage: '' },
        ]);
      petModel.find.mockReturnValue({ select });

      const result = await service.deleteAllForOwner(ownerId);

      expect(petModel.find).toHaveBeenCalledWith({
        owner: new Types.ObjectId(ownerId),
      });
      expect(storageProvider.deleteByUrl).toHaveBeenCalledTimes(1);
      expect(storageProvider.deleteByUrl).toHaveBeenCalledWith(
        '/uploads/pets/one.png',
      );
      expect(petModel.deleteMany).toHaveBeenCalledWith({
        owner: new Types.ObjectId(ownerId),
      });
      expect(result).toEqual({ deletedCount: 2 });
    });

    it('findIdsBySpecies matches species case-insensitively and escapes regex-special characters', async () => {
      const id = new Types.ObjectId();
      petModel.distinct.mockResolvedValue([id]);

      const result = await service.findIdsBySpecies('C.a*t');

      expect(petModel.distinct).toHaveBeenCalledWith('_id', {
        species: { $regex: '^C\\.a\\*t$', $options: 'i' },
      });
      expect(result).toEqual([id.toString()]);
    });

    it('findOwnersForPets returns an empty map for an empty input without querying', async () => {
      const result = await service.findOwnersForPets([]);

      expect(petModel.find).not.toHaveBeenCalled();
      expect(result.size).toBe(0);
    });

    it('findOwnersForPets maps each petId to its owner as strings', async () => {
      const otherPetId = new Types.ObjectId();
      const otherOwnerObjectId = new Types.ObjectId();
      const select = jest.fn().mockResolvedValue([
        { _id: new Types.ObjectId(petId), owner: new Types.ObjectId(ownerId) },
        { _id: otherPetId, owner: otherOwnerObjectId },
      ]);
      petModel.find.mockReturnValue({ select });

      const result = await service.findOwnersForPets([
        petId,
        otherPetId.toString(),
      ]);

      expect(result.get(petId)).toBe(ownerId);
      expect(result.get(otherPetId.toString())).toBe(
        otherOwnerObjectId.toString(),
      );
    });
  });
});
