import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';

import { MedicalService } from './medical.service';
import { MedicalRecord } from './schemas/medical-record.schema';
import { PetsService } from '../pets/pets.service';
import { STORAGE_PROVIDER } from '../storage/storage.constants';

describe('MedicalService', () => {
  let service: MedicalService;
  let medicalModel: {
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
  const recordId = new Types.ObjectId().toString();

  beforeEach(async () => {
    medicalModel = {
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
        MedicalService,
        { provide: getModelToken(MedicalRecord.name), useValue: medicalModel },
        { provide: PetsService, useValue: petsService },
        { provide: STORAGE_PROVIDER, useValue: storageProvider },
      ],
    }).compile();

    service = module.get<MedicalService>(MedicalService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('checks ownership before creating a record, scoped to the pet', async () => {
      petsService.findAccessiblePet.mockResolvedValue({ _id: petId });
      medicalModel.create.mockResolvedValue({ pet: petId });

      const dto = { title: 'Annual checkup', visitDate: new Date() };
      await service.create(ownerId, petId, dto);

      expect(petsService.findAccessiblePet).toHaveBeenCalledWith(
        ownerId,
        petId,
      );
      expect(medicalModel.create).toHaveBeenCalledWith({
        pet: new Types.ObjectId(petId),
        ...dto,
      });
    });

    it('propagates the NotFoundException when the caller does not own the pet', async () => {
      const notOwned = new Error('Pet not found');
      petsService.findAccessiblePet.mockRejectedValue(notOwned);

      await expect(
        service.create('someone-else', petId, { title: 'x' }),
      ).rejects.toThrow(notOwned);
      expect(medicalModel.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('checks ownership before listing records for the pet', async () => {
      petsService.findAccessiblePet.mockResolvedValue({ _id: petId });
      const sort = jest.fn().mockResolvedValue([]);
      medicalModel.find.mockReturnValue({ sort });

      await service.findAll(ownerId, petId);

      expect(petsService.findAccessiblePet).toHaveBeenCalledWith(
        ownerId,
        petId,
      );
      expect(medicalModel.find).toHaveBeenCalledWith({
        pet: new Types.ObjectId(petId),
      });
    });

    it('propagates the NotFoundException when the caller does not own the pet', async () => {
      const notOwned = new Error('Pet not found');
      petsService.findAccessiblePet.mockRejectedValue(notOwned);

      await expect(service.findAll('someone-else', petId)).rejects.toThrow(
        notOwned,
      );
      expect(medicalModel.find).not.toHaveBeenCalled();
    });
  });

  describe('addDocument', () => {
    const input = {
      url: '/uploads/medical-documents/cert.pdf',
      fileName: 'cert.pdf',
      mimeType: 'application/pdf',
    };

    it('checks access, then pushes the document onto the record', async () => {
      petsService.findAccessiblePet.mockResolvedValue({ _id: petId });
      medicalModel.findOneAndUpdate.mockResolvedValue({ _id: recordId });

      await service.addDocument(ownerId, petId, recordId, input);

      expect(petsService.findAccessiblePet).toHaveBeenCalledWith(
        ownerId,
        petId,
      );
      expect(medicalModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: recordId, pet: new Types.ObjectId(petId) },
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
      medicalModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.addDocument(ownerId, petId, recordId, input),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeDocument', () => {
    const documentId = new Types.ObjectId();
    const otherDocumentId = new Types.ObjectId();

    function makeRecord() {
      return {
        _id: recordId,
        documents: [
          { _id: documentId, url: '/uploads/medical-documents/cert.pdf' },
          { _id: otherDocumentId, url: '/uploads/medical-documents/other.pdf' },
        ],
        save: jest.fn().mockResolvedValue(undefined),
      };
    }

    it('removes only the targeted document, then deletes its stored file', async () => {
      petsService.findAccessiblePet.mockResolvedValue({ _id: petId });
      const record = makeRecord();
      medicalModel.findOne.mockResolvedValue(record);

      await service.removeDocument(
        ownerId,
        petId,
        recordId,
        documentId.toString(),
      );

      expect(record.documents).toEqual([
        { _id: otherDocumentId, url: '/uploads/medical-documents/other.pdf' },
      ]);
      expect(record.save).toHaveBeenCalled();
      expect(storageProvider.deleteByUrl).toHaveBeenCalledWith(
        '/uploads/medical-documents/cert.pdf',
      );
    });

    it('does not let a failed file cleanup block the document removal from succeeding', async () => {
      petsService.findAccessiblePet.mockResolvedValue({ _id: petId });
      const record = makeRecord();
      medicalModel.findOne.mockResolvedValue(record);
      storageProvider.deleteByUrl.mockRejectedValue(new Error('disk error'));

      await expect(
        service.removeDocument(ownerId, petId, recordId, documentId.toString()),
      ).resolves.toBe(record);
      expect(record.save).toHaveBeenCalled();
    });

    it('throws NotFoundException when the record does not exist for this pet', async () => {
      petsService.findAccessiblePet.mockResolvedValue({ _id: petId });
      medicalModel.findOne.mockResolvedValue(null);

      await expect(
        service.removeDocument(ownerId, petId, recordId, documentId.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the document does not exist on the record', async () => {
      petsService.findAccessiblePet.mockResolvedValue({ _id: petId });
      medicalModel.findOne.mockResolvedValue(makeRecord());

      await expect(
        service.removeDocument(
          ownerId,
          petId,
          recordId,
          new Types.ObjectId().toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAllForPets', () => {
    it('deletes every stored document file, then every medical record for the given pets', async () => {
      const otherPetId = new Types.ObjectId().toString();
      const select = jest.fn().mockResolvedValue([
        {
          documents: [{ url: '/uploads/medical-documents/a.pdf' }],
        },
        {
          documents: [{ url: '/uploads/medical-documents/b.pdf' }],
        },
      ]);
      medicalModel.find.mockReturnValue({ select });
      medicalModel.deleteMany.mockResolvedValue({ deletedCount: 3 });

      const result = await service.deleteAllForPets([petId, otherPetId]);

      expect(storageProvider.deleteByUrl).toHaveBeenCalledWith(
        '/uploads/medical-documents/a.pdf',
      );
      expect(storageProvider.deleteByUrl).toHaveBeenCalledWith(
        '/uploads/medical-documents/b.pdf',
      );
      expect(medicalModel.deleteMany).toHaveBeenCalledWith({
        pet: {
          $in: [new Types.ObjectId(petId), new Types.ObjectId(otherPetId)],
        },
      });
      expect(result).toEqual({ deletedCount: 3 });
    });

    it('skips the query entirely for an empty pet list', async () => {
      const result = await service.deleteAllForPets([]);

      expect(medicalModel.find).not.toHaveBeenCalled();
      expect(medicalModel.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({ deletedCount: 0 });
    });

    it('handlePetDeleted cascades on the PET_DELETED domain event (closes the self-service delete gap)', async () => {
      const select = jest.fn().mockResolvedValue([]);
      medicalModel.find.mockReturnValue({ select });
      medicalModel.deleteMany.mockResolvedValue({ deletedCount: 1 });

      await service.handlePetDeleted({ petId, ownerId });

      expect(medicalModel.deleteMany).toHaveBeenCalledWith({
        pet: { $in: [new Types.ObjectId(petId)] },
      });
    });
  });
});
