import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';

import { IdentityVerificationService } from './identity-verification.service';
import { IdentityVerification } from './schemas/identity-verification.schema';
import { IdentityVerificationStatus } from '../../common/enums/identity-verification-status.enum';
import { STORAGE_PROVIDER } from '../storage/storage.constants';
import { ActivityService } from '../activity/activity.service';

describe('IdentityVerificationService', () => {
  let service: IdentityVerificationService;
  let verificationModel: {
    findOne: jest.Mock;
    find: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    countDocuments: jest.Mock;
    distinct: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    deleteOne: jest.Mock;
  };
  let storageProvider: {
    uploadPrivate: jest.Mock;
    getSignedUrl: jest.Mock;
    deletePrivate: jest.Mock;
  };
  let activityService: { log: jest.Mock };

  const userId = new Types.ObjectId().toString();
  const adminId = new Types.ObjectId().toString();
  const file = {
    buffer: Buffer.from('x'),
    originalname: 'a.png',
    mimetype: 'image/png',
  } as Express.Multer.File;

  beforeEach(async () => {
    verificationModel = {
      findOne: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      countDocuments: jest.fn(),
      distinct: jest.fn().mockResolvedValue([]),
      findByIdAndUpdate: jest.fn(),
      deleteOne: jest.fn().mockResolvedValue(undefined),
    };
    storageProvider = {
      uploadPrivate: jest
        .fn()
        .mockResolvedValue('identity-verification/key.png'),
      getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/x'),
      deletePrivate: jest.fn().mockResolvedValue(undefined),
    };
    activityService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdentityVerificationService,
        {
          provide: getModelToken(IdentityVerification.name),
          useValue: verificationModel,
        },
        { provide: STORAGE_PROVIDER, useValue: storageProvider },
        { provide: ActivityService, useValue: activityService },
      ],
    }).compile();

    service = module.get<IdentityVerificationService>(
      IdentityVerificationService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('submit', () => {
    it('creates a new PENDING verification when none exists', async () => {
      verificationModel.findOne.mockResolvedValue(null);
      verificationModel.create.mockResolvedValue({
        status: IdentityVerificationStatus.PENDING,
      });

      await service.submit(userId, file, file);

      expect(verificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: IdentityVerificationStatus.PENDING,
        }),
      );
    });

    it('rejects resubmission while APPROVED', async () => {
      verificationModel.findOne.mockResolvedValue({
        status: IdentityVerificationStatus.APPROVED,
      });

      await expect(service.submit(userId, file, file)).rejects.toThrow(
        BadRequestException,
      );
      expect(storageProvider.uploadPrivate).not.toHaveBeenCalled();
    });

    it('resubmission after REJECTED deletes old files and resets to PENDING', async () => {
      const existing = {
        status: IdentityVerificationStatus.REJECTED,
        nidFrontKey: 'old-front',
        nidBackKey: 'old-back',
        rejectionReason: 'blurry',
        save: jest.fn().mockResolvedValue(undefined),
      };
      verificationModel.findOne.mockResolvedValue(existing);

      await service.submit(userId, file, file);

      expect(storageProvider.deletePrivate).toHaveBeenCalledWith('old-front');
      expect(storageProvider.deletePrivate).toHaveBeenCalledWith('old-back');
      expect(existing.status).toBe(IdentityVerificationStatus.PENDING);
      expect(existing.rejectionReason).toBeUndefined();
      expect(existing.save).toHaveBeenCalled();
    });
  });

  describe('isApproved / getApprovedUserIds', () => {
    it('isApproved returns false when no APPROVED record exists', async () => {
      verificationModel.findOne.mockResolvedValue(null);

      await expect(service.isApproved(userId)).resolves.toBe(false);
    });

    it('isApproved returns true when an APPROVED record exists', async () => {
      verificationModel.findOne.mockResolvedValue({ _id: '1' });

      await expect(service.isApproved(userId)).resolves.toBe(true);
    });

    it('getApprovedUserIds returns an empty set for an empty input without querying', async () => {
      const result = await service.getApprovedUserIds([]);

      expect(verificationModel.distinct).not.toHaveBeenCalled();
      expect(result.size).toBe(0);
    });

    it('getApprovedUserIds returns the approved subset as a Set of strings', async () => {
      const approvedId = new Types.ObjectId();
      verificationModel.distinct.mockResolvedValue([approvedId]);

      const result = await service.getApprovedUserIds([
        approvedId.toString(),
        new Types.ObjectId().toString(),
      ]);

      expect(result.has(approvedId.toString())).toBe(true);
      expect(result.size).toBe(1);
    });
  });

  describe('getSignedNidUrls', () => {
    it('throws NotFoundException when no APPROVED verification exists', async () => {
      verificationModel.findOne.mockResolvedValue(null);

      await expect(service.getSignedNidUrls(userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns signed URLs for both images', async () => {
      verificationModel.findOne.mockResolvedValue({
        nidFrontKey: 'front-key',
        nidBackKey: 'back-key',
      });

      const result = await service.getSignedNidUrls(userId);

      expect(storageProvider.getSignedUrl).toHaveBeenCalledWith(
        'front-key',
        expect.any(Number),
      );
      expect(storageProvider.getSignedUrl).toHaveBeenCalledWith(
        'back-key',
        expect.any(Number),
      );
      expect(result).toEqual({
        frontUrl: 'https://signed.example/x',
        backUrl: 'https://signed.example/x',
      });
    });
  });

  describe('adminGetSignedImages', () => {
    it('throws NotFoundException for an unknown id', async () => {
      verificationModel.findById.mockResolvedValue(null);

      await expect(
        service.adminGetSignedImages(adminId, 'missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns signed URLs and audit-logs the view', async () => {
      verificationModel.findById.mockResolvedValue({
        nidFrontKey: 'front-key',
        nidBackKey: 'back-key',
      });

      const result = await service.adminGetSignedImages(adminId, 'v1');

      expect(result).toEqual({
        frontUrl: 'https://signed.example/x',
        backUrl: 'https://signed.example/x',
      });
      expect(activityService.log).toHaveBeenCalledWith(
        adminId,
        'dating.nid.viewed',
        'v1',
        { context: 'admin-review' },
      );
    });
  });

  describe('admin actions', () => {
    it('adminApprove throws NotFoundException for an unknown id', async () => {
      verificationModel.findByIdAndUpdate.mockResolvedValue(null);

      await expect(service.adminApprove(adminId, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('adminApprove sets status APPROVED and logs the action', async () => {
      verificationModel.findByIdAndUpdate.mockResolvedValue({
        status: IdentityVerificationStatus.APPROVED,
      });

      await service.adminApprove(adminId, 'v1');

      expect(activityService.log).toHaveBeenCalledWith(
        adminId,
        'dating.identity-verification.approved',
        'v1',
      );
    });

    it('adminReject sets status REJECTED with a reason and logs the action', async () => {
      verificationModel.findByIdAndUpdate.mockResolvedValue({
        status: IdentityVerificationStatus.REJECTED,
      });

      await service.adminReject(adminId, 'v1', 'blurry');

      expect(verificationModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'v1',
        expect.objectContaining({
          status: IdentityVerificationStatus.REJECTED,
          rejectionReason: 'blurry',
        }),
        { new: true },
      );
      expect(activityService.log).toHaveBeenCalledWith(
        adminId,
        'dating.identity-verification.rejected',
        'v1',
        { reason: 'blurry' },
      );
    });
  });

  describe('deleteForUser', () => {
    it('no-ops when the user has no verification record', async () => {
      verificationModel.findOne.mockResolvedValue(null);

      const result = await service.deleteForUser(userId);

      expect(storageProvider.deletePrivate).not.toHaveBeenCalled();
      expect(result).toEqual({ deletedCount: 0 });
    });

    it('deletes both private files and the record', async () => {
      verificationModel.findOne.mockResolvedValue({
        _id: 'v1',
        nidFrontKey: 'front-key',
        nidBackKey: 'back-key',
      });

      const result = await service.deleteForUser(userId);

      expect(storageProvider.deletePrivate).toHaveBeenCalledWith('front-key');
      expect(storageProvider.deletePrivate).toHaveBeenCalledWith('back-key');
      expect(verificationModel.deleteOne).toHaveBeenCalledWith({ _id: 'v1' });
      expect(result).toEqual({ deletedCount: 1 });
    });
  });
});
