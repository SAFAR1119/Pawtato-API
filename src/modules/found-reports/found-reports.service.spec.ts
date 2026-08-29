import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Types } from 'mongoose';

import { FoundReportsService } from './found-reports.service';
import { FoundReport } from './schemas/found-report.schema';
import { TagsService } from '../tags/tags.service';
import { PetsService } from '../pets/pets.service';
import { ActivityService } from '../activity/activity.service';
import { STORAGE_PROVIDER } from '../storage/storage.constants';
import { TagStatus } from '../../common/enums/tag-status.enum';
import { FoundReportStatus } from '../../common/enums/found-report-status.enum';

describe('FoundReportsService', () => {
  let service: FoundReportsService;
  let foundReportModel: {
    create: jest.Mock;
    exists: jest.Mock;
    countDocuments: jest.Mock;
    find: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    deleteMany: jest.Mock;
  };
  let tagsService: { findByPublicCode: jest.Mock; findOwnedById: jest.Mock };
  let petsService: {
    findOwnedPet: jest.Mock;
    findAccessiblePet: jest.Mock;
    findWithOwner: jest.Mock;
  };
  let activityService: { log: jest.Mock };
  let storageProvider: { deleteByUrl: jest.Mock };

  const tagId = new Types.ObjectId();
  const petId = new Types.ObjectId();

  const dto = {
    message: 'Found near Road 27.',
    deviceFingerprint: 'device-fingerprint-abc123',
  };

  beforeEach(async () => {
    foundReportModel = {
      create: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      exists: jest.fn().mockResolvedValue(null),
      countDocuments: jest.fn().mockResolvedValue(0),
      find: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    tagsService = {
      findByPublicCode: jest.fn().mockResolvedValue({
        _id: tagId,
        status: TagStatus.ASSIGNED,
        assignedPetId: petId,
      }),
      findOwnedById: jest.fn().mockResolvedValue({ _id: tagId }),
    };
    petsService = {
      findOwnedPet: jest.fn(),
      findAccessiblePet: jest.fn(),
      findWithOwner: jest.fn().mockResolvedValue(null),
    };
    activityService = { log: jest.fn().mockResolvedValue(undefined) };
    storageProvider = { deleteByUrl: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FoundReportsService,
        {
          provide: getModelToken(FoundReport.name),
          useValue: foundReportModel,
        },
        { provide: TagsService, useValue: tagsService },
        { provide: PetsService, useValue: petsService },
        { provide: EventEmitter2, useValue: {} },
        { provide: ActivityService, useValue: activityService },
        { provide: STORAGE_PROVIDER, useValue: storageProvider },
      ],
    }).compile();

    service = module.get<FoundReportsService>(FoundReportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findForOwnedPet', () => {
    it('authorizes via findAccessiblePet (owner or caretaker), then lists reports for the pet', async () => {
      petsService.findAccessiblePet.mockResolvedValue({ _id: petId });
      const sort = jest.fn().mockResolvedValue([]);
      foundReportModel.find.mockReturnValue({ sort });

      await service.findForOwnedPet('user-1', petId.toString());

      expect(petsService.findAccessiblePet).toHaveBeenCalledWith(
        'user-1',
        petId.toString(),
      );
      expect(foundReportModel.find).toHaveBeenCalledWith({
        pet: petId,
      });
    });

    it('propagates the NotFoundException when the caller has no access to the pet', async () => {
      const notFound = new Error('Pet not found');
      petsService.findAccessiblePet.mockRejectedValue(notFound);

      await expect(
        service.findForOwnedPet('user-1', petId.toString()),
      ).rejects.toThrow(notFound);
      expect(foundReportModel.find).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('rejects a tag that is not currently linked to a pet', async () => {
      tagsService.findByPublicCode.mockResolvedValue({
        _id: tagId,
        status: TagStatus.AVAILABLE,
        assignedPetId: null,
      });

      await expect(service.create('CODE1', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(foundReportModel.create).not.toHaveBeenCalled();
    });

    it('creates the report and stores the device fingerprint', async () => {
      await service.create('CODE1', dto);

      expect(foundReportModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tag: tagId,
          pet: petId,
          deviceFingerprint: dto.deviceFingerprint,
        }),
      );
    });

    it('rejects a repeat submission for the same tag within the cooldown', async () => {
      foundReportModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });

      await expect(service.create('CODE1', dto)).rejects.toThrow(HttpException);
      expect(foundReportModel.create).not.toHaveBeenCalled();
    });

    it('rejects once the per-fingerprint hourly cap is hit', async () => {
      foundReportModel.countDocuments.mockResolvedValue(5);

      await expect(service.create('CODE1', dto)).rejects.toThrow(
        'Too many reports submitted from this device recently — please try again later.',
      );
      expect(foundReportModel.create).not.toHaveBeenCalled();
    });

    it('allows a fresh device under the cap to submit', async () => {
      foundReportModel.countDocuments.mockResolvedValue(4);

      await expect(service.create('CODE1', dto)).resolves.toBeDefined();
      expect(foundReportModel.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('findForOwnedTag', () => {
    it("checks tag ownership and returns that tag's reports, newest first", async () => {
      const sort = jest.fn().mockResolvedValue([]);
      foundReportModel.find.mockReturnValue({ sort });
      const ownerId = new Types.ObjectId().toString();

      await service.findForOwnedTag(ownerId, 'tag-id', false);

      expect(tagsService.findOwnedById).toHaveBeenCalledWith(
        ownerId,
        'tag-id',
        false,
      );
      expect(foundReportModel.find).toHaveBeenCalledWith({ tag: tagId });
      expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    });
  });

  describe('findAllAdmin', () => {
    it('filters by status and deviceFingerprint when provided', async () => {
      const limit = jest.fn().mockResolvedValue([]);
      const skip = jest.fn().mockReturnValue({ limit });
      const sort = jest.fn().mockReturnValue({ skip });
      const populate = jest.fn().mockReturnValue({ sort });
      foundReportModel.find.mockReturnValue({ populate });

      await service.findAllAdmin({
        page: 1,
        limit: 10,
        status: FoundReportStatus.PENDING,
        deviceFingerprint: 'device-1',
      });

      expect(foundReportModel.find).toHaveBeenCalledWith({
        status: FoundReportStatus.PENDING,
        deviceFingerprint: 'device-1',
      });
    });
  });

  describe('updateStatus', () => {
    it('stamps reviewedBy/reviewedAt and logs the moderation action', async () => {
      const reportId = new Types.ObjectId().toString();
      const actorId = new Types.ObjectId().toString();
      foundReportModel.findByIdAndUpdate.mockResolvedValue({
        _id: reportId,
        status: FoundReportStatus.DISMISSED,
      });

      const result = await service.updateStatus(
        reportId,
        actorId,
        FoundReportStatus.DISMISSED,
      );

      expect(foundReportModel.findByIdAndUpdate).toHaveBeenCalledWith(
        reportId,
        expect.objectContaining({
          status: FoundReportStatus.DISMISSED,
          reviewedAt: expect.any(Date) as Date,
        }),
        { new: true },
      );
      expect(activityService.log).toHaveBeenCalledWith(
        actorId,
        'found-report.status-changed',
        reportId,
        { status: FoundReportStatus.DISMISSED },
      );
      expect(result.status).toBe(FoundReportStatus.DISMISSED);
    });

    it('throws NotFoundException for an unknown report id', async () => {
      foundReportModel.findByIdAndUpdate.mockResolvedValue(null);
      const actorId = new Types.ObjectId().toString();

      await expect(
        service.updateStatus('missing', actorId, FoundReportStatus.REVIEWED),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAllForPetsAndTags', () => {
    it('skips the query entirely when both id lists are empty', async () => {
      const result = await service.deleteAllForPetsAndTags([], []);

      expect(foundReportModel.find).not.toHaveBeenCalled();
      expect(foundReportModel.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({ deletedCount: 0 });
    });

    it("deletes each matched report's photo before deleting the documents", async () => {
      const select = jest
        .fn()
        .mockResolvedValue([
          { photoUrl: '/uploads/found-reports/one.png' },
          { photoUrl: '' },
        ]);
      foundReportModel.find.mockReturnValue({ select });
      foundReportModel.deleteMany.mockResolvedValue({ deletedCount: 2 });

      const result = await service.deleteAllForPetsAndTags(
        [petId.toString()],
        [tagId.toString()],
      );

      expect(storageProvider.deleteByUrl).toHaveBeenCalledTimes(1);
      expect(storageProvider.deleteByUrl).toHaveBeenCalledWith(
        '/uploads/found-reports/one.png',
      );
      expect(foundReportModel.deleteMany).toHaveBeenCalled();
      expect(result).toEqual({ deletedCount: 2 });
    });

    it('still deletes the documents even when a photo cleanup fails', async () => {
      const select = jest
        .fn()
        .mockResolvedValue([{ photoUrl: '/uploads/found-reports/one.png' }]);
      foundReportModel.find.mockReturnValue({ select });
      foundReportModel.deleteMany.mockResolvedValue({ deletedCount: 1 });
      storageProvider.deleteByUrl.mockRejectedValue(new Error('boom'));

      const result = await service.deleteAllForPetsAndTags(
        [petId.toString()],
        [],
      );

      expect(foundReportModel.deleteMany).toHaveBeenCalled();
      expect(result).toEqual({ deletedCount: 1 });
    });
  });
});
