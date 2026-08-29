import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';

import { CaretakersService } from './caretakers.service';
import { PetCaretaker } from './schemas/pet-caretaker.schema';
import { PetsService } from '../pets/pets.service';
import { UsersService } from '../users/users.service';
import { ActivityService } from '../activity/activity.service';

describe('CaretakersService', () => {
  let service: CaretakersService;
  let caretakerModel: {
    create: jest.Mock;
    find: jest.Mock;
    findOneAndDelete: jest.Mock;
    deleteMany: jest.Mock;
  };
  let petsService: { findOwnedPet: jest.Mock; findAccessiblePet: jest.Mock };
  let usersService: { findByEmailForLookup: jest.Mock };
  let activityService: { log: jest.Mock };

  const ownerId = new Types.ObjectId().toString();
  const caretakerUserId = new Types.ObjectId();
  const petId = new Types.ObjectId().toString();

  beforeEach(async () => {
    caretakerModel = {
      create: jest.fn(),
      find: jest.fn(),
      findOneAndDelete: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    petsService = {
      findOwnedPet: jest.fn().mockResolvedValue({ _id: petId }),
      findAccessiblePet: jest.fn().mockResolvedValue({ _id: petId }),
    };
    usersService = { findByEmailForLookup: jest.fn() };
    activityService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaretakersService,
        {
          provide: getModelToken(PetCaretaker.name),
          useValue: caretakerModel,
        },
        { provide: PetsService, useValue: petsService },
        { provide: UsersService, useValue: usersService },
        { provide: ActivityService, useValue: activityService },
      ],
    }).compile();

    service = module.get<CaretakersService>(CaretakersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('add', () => {
    it('requires the caller to own the pet first', async () => {
      petsService.findOwnedPet.mockRejectedValue(
        new NotFoundException('Pet not found'),
      );

      await expect(
        service.add(ownerId, petId, { email: 'vet@example.com' }),
      ).rejects.toThrow(NotFoundException);
      expect(usersService.findByEmailForLookup).not.toHaveBeenCalled();
    });

    it('rejects when no account exists with that email', async () => {
      usersService.findByEmailForLookup.mockResolvedValue(null);

      await expect(
        service.add(ownerId, petId, { email: 'nobody@example.com' }),
      ).rejects.toThrow(NotFoundException);
      expect(caretakerModel.create).not.toHaveBeenCalled();
    });

    it('rejects adding yourself as a caretaker', async () => {
      usersService.findByEmailForLookup.mockResolvedValue({
        _id: new Types.ObjectId(ownerId),
        fullName: 'Self',
        email: 'self@example.com',
      });

      await expect(
        service.add(ownerId, petId, { email: 'self@example.com' }),
      ).rejects.toThrow(BadRequestException);
      expect(caretakerModel.create).not.toHaveBeenCalled();
    });

    it("creates a caretaker row and returns it populated with the caretaker's name/email", async () => {
      usersService.findByEmailForLookup.mockResolvedValue({
        _id: caretakerUserId,
        fullName: 'Dr. Vet',
        email: 'vet@example.com',
      });
      const populate = jest
        .fn()
        .mockResolvedValue({ userId: { fullName: 'Dr. Vet' } });
      caretakerModel.create.mockResolvedValue({ populate });

      await service.add(ownerId, petId, { email: 'vet@example.com' });

      expect(caretakerModel.create).toHaveBeenCalledWith({
        petId: new Types.ObjectId(petId),
        userId: caretakerUserId,
        addedBy: new Types.ObjectId(ownerId),
      });
      expect(populate).toHaveBeenCalledWith('userId', 'fullName email');
      expect(activityService.log).toHaveBeenCalledWith(
        ownerId,
        'pet.caretaker.added',
        petId,
        {
          caretakerUserId: caretakerUserId.toString(),
          caretakerEmail: 'vet@example.com',
        },
      );
    });

    it('rejects a duplicate caretaker via the unique index (E11000)', async () => {
      usersService.findByEmailForLookup.mockResolvedValue({
        _id: caretakerUserId,
        fullName: 'Dr. Vet',
        email: 'vet@example.com',
      });
      caretakerModel.create.mockRejectedValue({ code: 11000 });

      await expect(
        service.add(ownerId, petId, { email: 'vet@example.com' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('list', () => {
    it('is visible to the owner or an existing caretaker (findAccessiblePet), not owner-only', async () => {
      const sort = jest.fn().mockResolvedValue([]);
      const populateAddedBy = jest.fn().mockReturnValue({ sort });
      const populateUserId = jest
        .fn()
        .mockReturnValue({ populate: populateAddedBy });
      caretakerModel.find.mockReturnValue({ populate: populateUserId });

      await service.list(ownerId, petId);

      expect(petsService.findAccessiblePet).toHaveBeenCalledWith(
        ownerId,
        petId,
      );
      expect(caretakerModel.find).toHaveBeenCalledWith({
        petId: new Types.ObjectId(petId),
      });
    });
  });

  describe('remove', () => {
    it('is owner-only', async () => {
      petsService.findOwnedPet.mockRejectedValue(
        new NotFoundException('Pet not found'),
      );

      await expect(
        service.remove(ownerId, petId, 'caretaker-1'),
      ).rejects.toThrow(NotFoundException);
      expect(caretakerModel.findOneAndDelete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the caretaker row does not exist for this pet', async () => {
      caretakerModel.findOneAndDelete.mockResolvedValue(null);

      await expect(
        service.remove(ownerId, petId, 'caretaker-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deletes the caretaker row scoped to this pet', async () => {
      caretakerModel.findOneAndDelete.mockResolvedValue({
        _id: 'caretaker-1',
        userId: caretakerUserId,
      });

      const result = await service.remove(ownerId, petId, 'caretaker-1');

      expect(caretakerModel.findOneAndDelete).toHaveBeenCalledWith({
        _id: 'caretaker-1',
        petId: new Types.ObjectId(petId),
      });
      expect(activityService.log).toHaveBeenCalledWith(
        ownerId,
        'pet.caretaker.removed',
        petId,
        { caretakerUserId: caretakerUserId.toString() },
      );
      expect(result).toEqual({ message: 'Caretaker removed' });
    });
  });

  describe('leave', () => {
    it("deletes only the caller's own caretaker row, no pet-ownership check", async () => {
      caretakerModel.findOneAndDelete.mockResolvedValue({ _id: 'row-1' });

      const result = await service.leave(caretakerUserId.toString(), petId);

      expect(petsService.findOwnedPet).not.toHaveBeenCalled();
      expect(petsService.findAccessiblePet).not.toHaveBeenCalled();
      expect(caretakerModel.findOneAndDelete).toHaveBeenCalledWith({
        petId: new Types.ObjectId(petId),
        userId: caretakerUserId,
      });
      expect(activityService.log).toHaveBeenCalledWith(
        caretakerUserId.toString(),
        'pet.caretaker.left',
        petId,
      );
      expect(result.message).toContain('no longer a caretaker');
    });

    it('throws NotFoundException when the caller is not a caretaker for this pet', async () => {
      caretakerModel.findOneAndDelete.mockResolvedValue(null);

      await expect(
        service.leave(caretakerUserId.toString(), petId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cascade delete helpers', () => {
    it('deleteAllForPets skips the query for an empty pet list', async () => {
      const result = await service.deleteAllForPets([]);

      expect(caretakerModel.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({ deletedCount: 0 });
    });

    it('deleteAllForPets deletes every caretaker row for the given pets', async () => {
      caretakerModel.deleteMany.mockResolvedValue({ deletedCount: 2 });

      const result = await service.deleteAllForPets([petId]);

      expect(caretakerModel.deleteMany).toHaveBeenCalledWith({
        petId: { $in: [new Types.ObjectId(petId)] },
      });
      expect(result).toEqual({ deletedCount: 2 });
    });

    it('deleteAllForCaretakerUser deletes every row where this user is the caretaker', async () => {
      caretakerModel.deleteMany.mockResolvedValue({ deletedCount: 3 });

      const result = await service.deleteAllForCaretakerUser(ownerId);

      expect(caretakerModel.deleteMany).toHaveBeenCalledWith({
        userId: new Types.ObjectId(ownerId),
      });
      expect(result).toEqual({ deletedCount: 3 });
    });

    it('handlePetDeleted cascades on the PET_DELETED domain event', async () => {
      caretakerModel.deleteMany.mockResolvedValue({ deletedCount: 1 });

      await service.handlePetDeleted({ petId, ownerId });

      expect(caretakerModel.deleteMany).toHaveBeenCalledWith({
        petId: { $in: [new Types.ObjectId(petId)] },
      });
    });
  });
});
