import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { UsersService } from '../../users/users.service';
import { AccountStatus } from '../../../common/enums/account-status.enum';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let usersService: { findAuthState: jest.Mock };

  const basePayload = { sub: 'user-1', email: 'a@b.com', role: 'USER' };

  beforeEach(() => {
    usersService = { findAuthState: jest.fn() };

    const configService = {
      getOrThrow: () => 'test-secret',
    } as unknown as ConfigService;

    strategy = new JwtStrategy(
      configService,
      usersService as unknown as UsersService,
    );
  });

  it('rejects when the user no longer exists', async () => {
    usersService.findAuthState.mockResolvedValue(null);

    await expect(strategy.validate(basePayload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when the user is blocked (isActive: false)', async () => {
    usersService.findAuthState.mockResolvedValue({
      isActive: false,
      status: AccountStatus.ACTIVE,
      passwordChangedAt: undefined,
    });

    await expect(strategy.validate(basePayload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when the account is still pending email verification', async () => {
    usersService.findAuthState.mockResolvedValue({
      isActive: true,
      status: AccountStatus.PENDING_VERIFICATION,
      passwordChangedAt: undefined,
    });

    await expect(strategy.validate(basePayload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token issued before the last password change', async () => {
    const iat = Math.floor(Date.now() / 1000) - 3600; // issued 1h ago
    const passwordChangedAt = new Date(); // changed just now

    usersService.findAuthState.mockResolvedValue({
      isActive: true,
      status: AccountStatus.ACTIVE,
      passwordChangedAt,
    });

    await expect(strategy.validate({ ...basePayload, iat })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('accepts a token issued after the last password change', async () => {
    const passwordChangedAt = new Date(Date.now() - 3600 * 1000); // changed 1h ago
    const iat = Math.floor(Date.now() / 1000); // issued now

    usersService.findAuthState.mockResolvedValue({
      isActive: true,
      status: AccountStatus.ACTIVE,
      passwordChangedAt,
    });

    await expect(strategy.validate({ ...basePayload, iat })).resolves.toEqual({
      ...basePayload,
      iat,
    });
  });

  it('accepts a valid, active user with no password change on record', async () => {
    usersService.findAuthState.mockResolvedValue({
      isActive: true,
      status: AccountStatus.ACTIVE,
      passwordChangedAt: undefined,
    });

    await expect(strategy.validate(basePayload)).resolves.toEqual(basePayload);
  });
});
