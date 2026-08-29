import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';

import { VaccinationsService } from './vaccinations.service';
import { Vaccination } from './schemas/vaccination.schema';
import { PetsService } from '../pets/pets.service';
import { STORAGE_PROVIDER } from '../storage/storage.constants';

describe('VaccinationsService', () => {
  let service: VaccinationsService;
  let vaccinationModel: {
    create: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    deleteMany: jest.Mock;
  };
  let petsService: { findAccessiblePet: jest.Mock };
  let storageProvider: { deleteByUrl: jest.Mock };

  const ownerId = new Types.ObjectId().toString();
  const petId = new Types.ObjectId().toString();
  const vaccinationId = new Types.ObjectId().toString();

  const dto = {
    vaccineName: 'Rabies',
    administeredDate: new Date('2026-01-15'),
    nextDueDate: new Date('2027-01-15'),
  };

  beforeEach(async () => {
    vaccinationModel = {
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    petsService = { findAccessiblePet: jest.fn() };
    storageProvider = { deleteByUrl: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaccinationsService,
        {
          provide: getModelToken(Vaccination.name),
          useValue: vaccinationModel,
        },
        { provide: PetsService, useValue: petsService },
        { provide: STORAGE_PROVIDER, useValue: storageProvider },
      ],
    }).compile();

    service = module.get<VaccinationsService>(VaccinationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('checks ownership before creating a record, scoped to the pet', async () => {
      petsService.findAccessiblePet.mockResolvedValue({ _id: petId });
      vaccinationModel.create.mockResolvedValue({ pet: petId });

      await service.create(ownerId, petId, dto);

      expect(petsService.findAccessiblePet).toHaveBeenCalledWith(
        ownerId,
        petId,
      );
      expect(vaccinationModel.create).toHaveBeenCalledWith({
        pet: new Types.ObjectId(petId),
        ...dto,
      });
    });

    it('propagates the NotFoundException when the caller does not own the pet', async () => {
      const notOwned = new Error('Pet not found');
      petsService.findAccessiblePet.mockRejectedValue(notOwned);

      await expect(service.create('someone-else', petId, dto)).rejects.toThrow(
        notOwned,
      );
      expect(vaccinationModel.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('checks ownership before listing records for the pet, sorted by next due date', async () => {
      petsService.findAccessiblePet.mockResolvedValue({ _id: petId });
      const sort = jest.fn().mockResolvedValue([]);
      vaccinationModel.find.mockReturnValue({ sort });

      await service.findAll(ownerId, petId);

      expect(petsService.findAccessiblePet).toHaveBeenCalledWith(
        ownerId,
        petId,
      );
      expect(vaccinationModel.find).toHaveBeenCalledWith({
        pet: new Types.ObjectId(petId),
      });
      expect(sort).toHaveBeenCalledWith({ nextDueDate: 1 });
    });

    it('propagates the NotFoundException when the caller does not own the pet', async () => {
      const notOwned = new Error('Pet not found');
      petsService.findAccessiblePet.mockRejectedValue(notOwned);

      await expect(service.findAll('someone-else', petId)).rejects.toThrow(
        notOwned,
      );
      expect(vaccinationModel.find).not.toHaveBeenCalled();
    });
  });

  describe('addDocument', () => {
    const input = {
      url: '/uploads/vaccination-documents/cert.pdf',
      fileName: 'cert.pdf',
      mimeType: 'application/pdf',
    };

    it('checks access, then pushes the document onto the record', async () => {
      petsService.findAccessiblePet.mockResolvedValue({ _id: petId });
      vaccinationModel.findOneAndUpdate.mockResolvedValue({
        _id: vaccinationId,
      });

      await service.addDocument(ownerId, petId, vaccinationId, input);

      expect(petsService.findAccessiblePet).toHaveBeenCalledWith(
        ownerId,
        petId,
      );
      expect(vaccinationModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: vaccinationId, pet: new Types.ObjectId(petId) },
        {
          $push: {
            documents: expect.objectContaining({
              url: input.url,
              fileName: input.fileName,
              mimeType: input.mimeType,
            }) as unknown,
          },
        },
        { new: true },
      );
    });

    it('throws NotFoundException when the record does not belong to this pet', async () => {
      petsService.findAccessiblePet.mockResolvedValue({ _id: petId });
      vaccinationModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.addDocument(ownerId, petId, vaccinationId, input),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeDocument', () => {
    const documentId = new Types.ObjectId();
    const otherDocumentId = new Types.ObjectId();

    function makeVaccination() {
      return {
        _id: vaccinationId,
        documents: [
          {
            _id: documentId,
            url: '/uploads/vaccination-documents/cert.pdf',
          },
          {
            _id: otherDocumentId,
            url: '/uploads/vaccination-documents/other.pdf',
          },
        ],
        save: jest.fn().mockResolvedValue(undefined),
      };
    }

    it('removes only the targeted document, then deletes its stored file', async () => {
      petsService.findAccessiblePet.mockResolvedValue({ _id: petId });
      const vaccination = makeVaccination();
      vaccinationModel.findOne.mockResolvedValue(vaccination);

      await service.removeDocument(
        ownerId,
        petId,
        vaccinationId,
        documentId.toString(),
      );

      expect(vaccination.documents).toEqual([
        {
          _id: otherDocumentId,
          url: '/uploads/vaccination-documents/other.pdf',
        },
      ]);
      expect(vaccination.save).toHaveBeenCalled();
      expect(storageProvider.deleteByUrl).toHaveBeenCalledWith(
        '/uploads/vaccination-documents/cert.pdf',
      );
    });

    it('does not let a failed file cleanup block the document removal from succeeding', async () => {
      petsService.findAccessiblePet.mockResolvedValue({ _id: petId });
      const vaccination = makeVaccination();
      vaccinationModel.findOne.mockResolvedValue(vaccination);
      storageProvider.deleteByUrl.mockRejectedValue(new Error('disk error'));

      await expect(
        service.removeDocument(
          ownerId,
          petId,
          vaccinationId,
          documentId.toString(),
        ),
      ).resolves.toBe(vaccination);
      expect(vaccination.save).toHaveBeenCalled();
    });

    it('throws NotFoundException when the record does not exist for this pet', async () => {
      petsService.findAccessiblePet.mockResolvedValue({ _id: petId });
      vaccinationModel.findOne.mockResolvedValue(null);

      await expect(
        service.removeDocument(
          ownerId,
          petId,
          vaccinationId,
          documentId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the document does not exist on the record', async () => {
      petsService.findAccessiblePet.mockResolvedValue({ _id: petId });
      vaccinationModel.findOne.mockResolvedValue(makeVaccination());

      await expect(
        service.removeDocument(
          ownerId,
          petId,
          vaccinationId,
          new Types.ObjectId().toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAllForPets', () => {
    it('deletes every stored document file, then every vaccination record for the given pets', async () => {
      const otherPetId = new Types.ObjectId().toString();
      const select = jest
        .fn()
        .mockResolvedValue([
          { documents: [{ url: '/uploads/vaccination-documents/a.pdf' }] },
          { documents: [{ url: '/uploads/vaccination-documents/b.pdf' }] },
        ]);
      vaccinationModel.find.mockReturnValue({ select });
      vaccinationModel.deleteMany.mockResolvedValue({ deletedCount: 3 });

      const result = await service.deleteAllForPets([petId, otherPetId]);

      expect(storageProvider.deleteByUrl).toHaveBeenCalledWith(
        '/uploads/vaccination-documents/a.pdf',
      );
      expect(storageProvider.deleteByUrl).toHaveBeenCalledWith(
        '/uploads/vaccination-documents/b.pdf',
      );
      expect(vaccinationModel.deleteMany).toHaveBeenCalledWith({
        pet: {
          $in: [new Types.ObjectId(petId), new Types.ObjectId(otherPetId)],
        },
      });
      expect(result).toEqual({ deletedCount: 3 });
    });

    it('skips the query entirely for an empty pet list', async () => {
      const result = await service.deleteAllForPets([]);

      expect(vaccinationModel.find).not.toHaveBeenCalled();
      expect(vaccinationModel.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({ deletedCount: 0 });
    });

    it('handlePetDeleted cascades on the PET_DELETED domain event (closes the self-service delete gap)', async () => {
      const select = jest.fn().mockResolvedValue([]);
      vaccinationModel.find.mockReturnValue({ select });
      vaccinationModel.deleteMany.mockResolvedValue({ deletedCount: 1 });

      await service.handlePetDeleted({ petId, ownerId });

      expect(vaccinationModel.deleteMany).toHaveBeenCalledWith({
        pet: { $in: [new Types.ObjectId(petId)] },
      });
    });
  });
});
