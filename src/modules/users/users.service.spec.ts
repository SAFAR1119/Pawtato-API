import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import { Pet } from '../pets/schemas/pet.schema';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { STORAGE_PROVIDER } from '../storage/storage.constants';

describe('UsersService', () => {
  let service: UsersService;
  let userModel: {
    create: jest.Mock;
    findOne: jest.Mock;
    findById: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    findByIdAndDelete: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
  };
  let storageProvider: { deleteByUrl: jest.Mock };

  beforeEach(async () => {
    userModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
    };
    storageProvider = { deleteByUrl: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Pet.name), useValue: {} },
        { provide: STORAGE_PROVIDER, useValue: storageProvider },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createUser', () => {
    it('hashes the password and creates the account as PendingVerification', async () => {
      userModel.create.mockResolvedValue({ id: 'user-1' });

      await service.createUser({
        fullName: 'Sarah Ahmed',
        email: 'sarah@example.com',
        password: 'StrongPass123',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('StrongPass123', 10);
      expect(userModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'sarah@example.com',
          password: 'hashed-password',
          status: AccountStatus.PENDING_VERIFICATION,
        }),
      );
    });

    it('propagates a duplicate-key error to the caller instead of swallowing it', async () => {
      const duplicateKeyError = Object.assign(new Error('E11000'), {
        code: 11000,
      });
      userModel.create.mockRejectedValue(duplicateKeyError);

      await expect(
        service.createUser({
          fullName: 'Sarah Ahmed',
          email: 'sarah@example.com',
          password: 'StrongPass123',
        }),
      ).rejects.toBe(duplicateKeyError);
    });
  });

  describe('findByEmail', () => {
    it('selects the password and OTP fields needed by the auth flows', async () => {
      const select = jest
        .fn()
        .mockResolvedValue({ email: 'sarah@example.com' });
      userModel.findOne.mockReturnValue({ select });

      const result = await service.findByEmail('sarah@example.com');

      expect(userModel.findOne).toHaveBeenCalledWith({
        email: 'sarah@example.com',
      });
      expect(select).toHaveBeenCalledWith('+password +otpHash +otpAttempts');
      expect(result).toEqual({ email: 'sarah@example.com' });
    });
  });

  describe('findByEmailForLookup', () => {
    it('selects only the safe-to-return display fields, never password/OTP', async () => {
      const select = jest.fn().mockResolvedValue({
        _id: 'user-2',
        fullName: 'Dr. Vet',
        email: 'vet@example.com',
      });
      userModel.findOne.mockReturnValue({ select });

      const result = await service.findByEmailForLookup('vet@example.com');

      expect(userModel.findOne).toHaveBeenCalledWith({
        email: 'vet@example.com',
      });
      expect(select).toHaveBeenCalledWith('_id fullName email');
      expect(result).toEqual({
        _id: 'user-2',
        fullName: 'Dr. Vet',
        email: 'vet@example.com',
      });
    });
  });

  describe('setOtp', () => {
    it('overwrites the OTP fields and resets the attempt counter', async () => {
      userModel.findByIdAndUpdate.mockResolvedValue({});
      const expiresAt = new Date();

      await service.setOtp('user-1', 'hash-value', expiresAt);

      expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith('user-1', {
        otpHash: 'hash-value',
        otpExpiresAt: expiresAt,
        otpAttempts: 0,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest's `expect.any` is untyped (`any`) by design
        otpLastSentAt: expect.any(Date),
      });
    });
  });

  describe('activateAccount', () => {
    it('flips status to Active and clears every OTP field', async () => {
      const select = jest
        .fn()
        .mockResolvedValue({ status: AccountStatus.ACTIVE });
      userModel.findByIdAndUpdate.mockReturnValue({ select });

      const result = await service.activateAccount('user-1');

      expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          status: AccountStatus.ACTIVE,
          otpHash: null,
          otpExpiresAt: null,
          otpAttempts: 0,
          otpLastSentAt: null,
        }),
        { new: true },
      );
      expect(result).toEqual({ status: AccountStatus.ACTIVE });
    });
  });

  describe('clearOtp', () => {
    it('invalidates the current OTP without touching status', async () => {
      userModel.findByIdAndUpdate.mockResolvedValue({});

      await service.clearOtp('user-1');

      expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith('user-1', {
        otpHash: null,
        otpExpiresAt: null,
        otpAttempts: 0,
      });
    });
  });

  describe('updateAvatar', () => {
    it('replaces the avatar and cleans up the previous file', async () => {
      userModel.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ avatar: '/uploads/old.png' }),
      });
      userModel.findByIdAndUpdate.mockResolvedValue({
        avatar: '/uploads/new.png',
      });

      const result = await service.updateAvatar('user-1', '/uploads/new.png');

      expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'user-1',
        { avatar: '/uploads/new.png' },
        { new: true },
      );
      expect(storageProvider.deleteByUrl).toHaveBeenCalledWith(
        '/uploads/old.png',
      );
      expect(result).toEqual({ avatar: '/uploads/new.png' });
    });

    it('does not attempt cleanup when there was no previous avatar', async () => {
      userModel.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ avatar: '' }),
      });
      userModel.findByIdAndUpdate.mockResolvedValue({});

      await service.updateAvatar('user-1', '/uploads/new.png');

      expect(storageProvider.deleteByUrl).not.toHaveBeenCalled();
    });
  });

  describe('admin moderation actions', () => {
    it('blockUser sets isActive to false', async () => {
      userModel.findByIdAndUpdate.mockResolvedValue({ isActive: false });

      await service.blockUser('user-1');

      expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'user-1',
        { isActive: false },
        { new: true },
      );
    });

    it('unblockUser sets isActive to true', async () => {
      userModel.findByIdAndUpdate.mockResolvedValue({ isActive: true });

      await service.unblockUser('user-1');

      expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'user-1',
        { isActive: true },
        { new: true },
      );
    });

    it('changeRole updates the role field', async () => {
      userModel.findByIdAndUpdate.mockResolvedValue({ role: UserRole.ADMIN });

      await service.changeRole('user-1', UserRole.ADMIN);

      expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'user-1',
        { role: UserRole.ADMIN },
        { new: true },
      );
    });
  });

  describe('findAll (admin listing)', () => {
    it('builds a case-insensitive name/email search filter', async () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      };
      userModel.find.mockReturnValue(chain);
      userModel.countDocuments.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        limit: 20,
        search: 'sarah',
        sort: 'createdAt',
        order: 'desc',
      });

      expect(userModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [
            { fullName: { $regex: 'sarah', $options: 'i' } },
            { email: { $regex: 'sarah', $options: 'i' } },
          ],
        }),
      );
    });
  });

  describe('deleteUser', () => {
    it('throws NotFoundException for an unknown user and never touches storage', async () => {
      userModel.findByIdAndDelete.mockResolvedValue(null);

      await expect(service.deleteUser('missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(storageProvider.deleteByUrl).not.toHaveBeenCalled();
    });

    it('deletes the user and cleans up their avatar file', async () => {
      userModel.findByIdAndDelete.mockResolvedValue({
        _id: 'user-1',
        avatar: '/uploads/avatars/one.png',
      });

      const result = await service.deleteUser('user-1');

      expect(storageProvider.deleteByUrl).toHaveBeenCalledWith(
        '/uploads/avatars/one.png',
      );
      expect(result).toEqual({ message: 'User deleted successfully' });
    });

    it('skips avatar cleanup when the user never had one', async () => {
      userModel.findByIdAndDelete.mockResolvedValue({
        _id: 'user-1',
        avatar: '',
      });

      await service.deleteUser('user-1');

      expect(storageProvider.deleteByUrl).not.toHaveBeenCalled();
    });
  });
});
