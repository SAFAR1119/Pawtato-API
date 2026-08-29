import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { hashOtp } from './utils/otp.util';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: Record<string, jest.Mock>;
  let jwtService: { signAsync: jest.Mock };
  let notificationsService: { sendTemplateEmail: jest.Mock };

  const RAW_OTP = '123456';

  function makeUser(overrides: Record<string, unknown> = {}) {
    const id = (overrides.id as string) ?? 'user-1';

    return {
      id,
      _id: { toString: () => id },
      fullName: 'Sarah Ahmed',
      email: 'sarah@example.com',
      password: 'hashed-password',
      role: 'USER',
      status: AccountStatus.PENDING_VERIFICATION,
      otpHash: undefined,
      otpExpiresAt: undefined,
      otpAttempts: 0,
      otpLastSentAt: undefined,
      ...overrides,
    };
  }

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      createUser: jest.fn(),
      setOtp: jest.fn(),
      incrementOtpAttempts: jest.fn(),
      clearOtp: jest.fn(),
      activateAccount: jest.fn(),
      setPasswordResetToken: jest.fn(),
      findByResetTokenHash: jest.fn(),
      resetPassword: jest.fn(),
    };

    jwtService = { signAsync: jest.fn().mockResolvedValue('signed-jwt') };

    notificationsService = {
      sendTemplateEmail: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: { get: (_key: string, fallback?: unknown) => fallback },
        },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    const dto = {
      fullName: 'Sarah Ahmed',
      email: ' Sarah@Example.com ',
      password: 'StrongPass123',
    };

    it('creates a pending account and sends an OTP for a brand-new email', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.createUser.mockResolvedValue(makeUser());

      const result = await service.register(dto);

      expect(usersService.findByEmail).toHaveBeenCalledWith(
        'sarah@example.com',
      );
      expect(usersService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'sarah@example.com' }),
      );
      expect(usersService.setOtp).toHaveBeenCalledTimes(1);
      expect(notificationsService.sendTemplateEmail).toHaveBeenCalledWith(
        'sarah@example.com',
        expect.any(String),
        'verify-otp',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest's `expect.stringMatching` is untyped (`any`) by design
        expect.objectContaining({ otp: expect.stringMatching(/^\d{6}$/) }),
      );
      expect(result).toEqual({
        message: 'Verification code sent to your email.',
        email: 'sarah@example.com',
        status: AccountStatus.PENDING_VERIFICATION,
      });
    });

    it('does not create a second account for an existing pending email, and sends a new OTP', async () => {
      usersService.findByEmail.mockResolvedValue(
        makeUser({ status: AccountStatus.PENDING_VERIFICATION }),
      );

      const result = await service.register(dto);

      expect(usersService.createUser).not.toHaveBeenCalled();
      expect(usersService.setOtp).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(AccountStatus.PENDING_VERIFICATION);
    });

    it('rejects with "Email already registered." for an active account and sends no OTP', async () => {
      usersService.findByEmail.mockResolvedValue(
        makeUser({ status: AccountStatus.ACTIVE }),
      );

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      await expect(service.register(dto)).rejects.toThrow(
        'Email already registered.',
      );
      expect(usersService.createUser).not.toHaveBeenCalled();
      expect(usersService.setOtp).not.toHaveBeenCalled();
    });

    it('recovers from a concurrent duplicate-key race without creating two accounts', async () => {
      usersService.findByEmail
        .mockResolvedValueOnce(null) // initial check: nobody there yet
        .mockResolvedValueOnce(
          makeUser({ status: AccountStatus.PENDING_VERIFICATION }),
        ); // re-fetch after losing the insert race

      const duplicateKeyError = Object.assign(new Error('E11000'), {
        code: 11000,
      });
      usersService.createUser.mockRejectedValue(duplicateKeyError);

      const result = await service.register(dto);

      expect(usersService.findByEmail).toHaveBeenCalledTimes(2);
      expect(usersService.setOtp).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(AccountStatus.PENDING_VERIFICATION);
    });

    it('respects the resend cooldown when re-registering a recently-created pending account', async () => {
      usersService.findByEmail.mockResolvedValue(
        makeUser({
          status: AccountStatus.PENDING_VERIFICATION,
          otpLastSentAt: new Date(),
        }),
      );

      await service.register(dto);

      expect(usersService.setOtp).not.toHaveBeenCalled();
      expect(notificationsService.sendTemplateEmail).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    beforeEach(() => {
      (bcrypt.compare as jest.Mock).mockImplementation((plain: string) =>
        Promise.resolve(plain === 'correct-password'),
      );
    });

    it('logs an active account in with correct credentials', async () => {
      usersService.findByEmail.mockResolvedValue(
        makeUser({ status: AccountStatus.ACTIVE }),
      );

      const result = await service.login({
        email: 'sarah@example.com',
        password: 'correct-password',
      });

      expect(result).toEqual(
        expect.objectContaining({ accessToken: 'signed-jwt' }),
      );
      expect(usersService.setOtp).not.toHaveBeenCalled();
    });

    it('rejects an active account with an incorrect password', async () => {
      usersService.findByEmail.mockResolvedValue(
        makeUser({ status: AccountStatus.ACTIVE }),
      );

      await expect(
        service.login({ email: 'sarah@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an unknown email with the same generic message as a wrong password', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'nobody@example.com',
          password: 'correct-password',
        }),
      ).rejects.toThrow('Invalid email or password');
    });

    it('does not issue a token for a pending account, sends a new OTP instead', async () => {
      usersService.findByEmail.mockResolvedValue(
        makeUser({ status: AccountStatus.PENDING_VERIFICATION }),
      );

      const result = await service.login({
        email: 'sarah@example.com',
        password: 'correct-password',
      });

      expect(result).toEqual(
        expect.objectContaining({
          verificationRequired: true,
          status: AccountStatus.PENDING_VERIFICATION,
        }),
      );
      expect(result).not.toHaveProperty('accessToken');
      expect(usersService.setOtp).toHaveBeenCalledTimes(1);
    });

    it('does not bypass the password check just because the account is pending', async () => {
      usersService.findByEmail.mockResolvedValue(
        makeUser({ status: AccountStatus.PENDING_VERIFICATION }),
      );

      await expect(
        service.login({ email: 'sarah@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(usersService.setOtp).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    const validOtpUser = () =>
      makeUser({
        otpHash: hashOtp(RAW_OTP),
        otpExpiresAt: new Date(Date.now() + 60_000),
        otpAttempts: 0,
      });

    it('activates the account and returns an access token for a correct OTP', async () => {
      const user = validOtpUser();
      usersService.findByEmail.mockResolvedValue(user);
      usersService.activateAccount.mockResolvedValue(
        makeUser({ status: AccountStatus.ACTIVE }),
      );

      const result = await service.verifyOtp({
        email: user.email,
        otp: RAW_OTP,
      });

      expect(usersService.activateAccount).toHaveBeenCalledWith(user.id);
      expect(result).toEqual(
        expect.objectContaining({ accessToken: 'signed-jwt' }),
      );
    });

    it('rejects an incorrect OTP and increments the attempt count', async () => {
      const user = validOtpUser();
      usersService.findByEmail.mockResolvedValue(user);

      await expect(
        service.verifyOtp({ email: user.email, otp: '000000' }),
      ).rejects.toThrow(BadRequestException);
      expect(usersService.incrementOtpAttempts).toHaveBeenCalledWith(user.id);
      expect(usersService.activateAccount).not.toHaveBeenCalled();
    });

    it('rejects an expired OTP', async () => {
      const user = makeUser({
        otpHash: hashOtp(RAW_OTP),
        otpExpiresAt: new Date(Date.now() - 1000),
      });
      usersService.findByEmail.mockResolvedValue(user);

      await expect(
        service.verifyOtp({ email: user.email, otp: RAW_OTP }),
      ).rejects.toThrow(BadRequestException);
      expect(usersService.activateAccount).not.toHaveBeenCalled();
    });

    it('rejects when no OTP has ever been issued (or it was already consumed)', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser());

      await expect(
        service.verifyOtp({ email: 'sarah@example.com', otp: RAW_OTP }),
      ).rejects.toThrow('Invalid or expired OTP.');
    });

    it('rejects an OTP for an account that is already active', async () => {
      const user = makeUser({
        status: AccountStatus.ACTIVE,
        otpHash: hashOtp(RAW_OTP),
        otpExpiresAt: new Date(Date.now() + 60_000),
      });
      usersService.findByEmail.mockResolvedValue(user);

      await expect(
        service.verifyOtp({ email: user.email, otp: RAW_OTP }),
      ).rejects.toThrow(BadRequestException);
    });

    it('clears the OTP and rejects once the attempt limit is reached', async () => {
      const user = makeUser({
        otpHash: hashOtp(RAW_OTP),
        otpExpiresAt: new Date(Date.now() + 60_000),
        otpAttempts: 5,
      });
      usersService.findByEmail.mockResolvedValue(user);

      await expect(
        service.verifyOtp({ email: user.email, otp: RAW_OTP }),
      ).rejects.toThrow('Too many incorrect attempts');
      expect(usersService.clearOtp).toHaveBeenCalledWith(user.id);
      expect(usersService.incrementOtpAttempts).not.toHaveBeenCalled();
    });
  });

  describe('resendOtp', () => {
    it('returns the generic message and sends nothing for an unknown email', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.resendOtp({ email: 'nobody@example.com' });

      expect(result.message).toMatch(/if that account exists/i);
      expect(usersService.setOtp).not.toHaveBeenCalled();
    });

    it('returns the generic message and sends nothing for an already-active account', async () => {
      usersService.findByEmail.mockResolvedValue(
        makeUser({ status: AccountStatus.ACTIVE }),
      );

      await service.resendOtp({ email: 'sarah@example.com' });

      expect(usersService.setOtp).not.toHaveBeenCalled();
    });

    it('issues a new OTP once the cooldown has elapsed', async () => {
      usersService.findByEmail.mockResolvedValue(
        makeUser({
          status: AccountStatus.PENDING_VERIFICATION,
          otpLastSentAt: new Date(Date.now() - 61_000),
        }),
      );

      await service.resendOtp({ email: 'sarah@example.com' });

      expect(usersService.setOtp).toHaveBeenCalledTimes(1);
    });

    it('rejects with a cooldown error when requested too soon', async () => {
      usersService.findByEmail.mockResolvedValue(
        makeUser({
          status: AccountStatus.PENDING_VERIFICATION,
          otpLastSentAt: new Date(),
        }),
      );

      await expect(
        service.resendOtp({ email: 'sarah@example.com' }),
      ).rejects.toThrow(BadRequestException);
      expect(usersService.setOtp).not.toHaveBeenCalled();
    });
  });
});
