import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { QueryFilter, Model } from 'mongoose';

import * as bcrypt from 'bcrypt';

import { User, UserDocument } from './schemas/user.schema';
import { Pet, PetDocument } from '../pets/schemas/pet.schema';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserRole } from '../../common/enums/user-role.enum';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { AdminUserQueryDto } from '../admin/dto/admin-user-query.dto';
import { STORAGE_PROVIDER } from '../storage/storage.constants';
import type { StorageProvider } from '../storage/interfaces/storage-provider.interface';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Pet.name)
    private readonly petModel: Model<PetDocument>,

    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  // No pre-insert existence check here by design — AuthService already
  // decides whether to call this (only when no account exists for the
  // normalized email). The email field's unique index is the real guard
  // against a race between two concurrent registrations; a duplicate-key
  // error (code 11000) propagates to the caller to handle as "someone else
  // just won this race" rather than a generic 500.
  async createUser(createUserDto: CreateUserDto) {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    return this.userModel.create({
      ...createUserDto,
      password: hashedPassword,
      status: AccountStatus.PENDING_VERIFICATION,
    });
  }

  // Selects the sensitive fields needed across the auth flows (login's
  // password check, OTP issuance/verification) — never returned directly to
  // an API response, only consumed internally by AuthService.
  async findByEmail(email: string) {
    return this.userModel
      .findOne({ email })
      .select('+password +otpHash +otpAttempts');
  }

  // Safe-to-return lookup for cross-user references (e.g. Phase 15's "add a
  // caretaker by email") — deliberately does NOT use findByEmail()'s
  // '+password +otpHash +otpAttempts' pattern, relying instead on those
  // fields' own `select: false` schema default to stay excluded. Only the
  // three fields a caller ever needs to identify/display another user are
  // selected explicitly.
  async findByEmailForLookup(email: string) {
    return this.userModel.findOne({ email }).select('_id fullName email');
  }

  async setOtp(userId: string, otpHash: string, expiresAt: Date) {
    return this.userModel.findByIdAndUpdate(userId, {
      otpHash,
      otpExpiresAt: expiresAt,
      otpAttempts: 0,
      otpLastSentAt: new Date(),
    });
  }

  async incrementOtpAttempts(userId: string) {
    return this.userModel.findByIdAndUpdate(userId, {
      $inc: { otpAttempts: 1 },
    });
  }

  // Invalidates the current OTP without issuing a new one — used once the
  // attempt limit is hit, forcing the user through resend-otp (and its
  // cooldown) rather than letting them keep guessing against the same code.
  async clearOtp(userId: string) {
    return this.userModel.findByIdAndUpdate(userId, {
      otpHash: null,
      otpExpiresAt: null,
      otpAttempts: 0,
    });
  }

  async activateAccount(userId: string) {
    return this.userModel
      .findByIdAndUpdate(
        userId,
        {
          status: AccountStatus.ACTIVE,
          otpHash: null,
          otpExpiresAt: null,
          otpAttempts: 0,
          otpLastSentAt: null,
        },
        { new: true },
      )
      .select('-password');
  }

  async findByResetTokenHash(tokenHash: string) {
    return this.userModel
      .findOne({ passwordResetTokenHash: tokenHash })
      .select('+passwordResetTokenHash');
  }

  async setPasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ) {
    return this.userModel.findByIdAndUpdate(userId, {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: expiresAt,
    });
  }

  async resetPassword(userId: string, hashedPassword: string) {
    const changedAt = new Date();

    await this.userModel.findByIdAndUpdate(userId, {
      password: hashedPassword,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      passwordChangedAt: changedAt,
    });

    return changedAt;
  }

  // Lean lookup used on every authenticated request (JwtStrategy) — only the
  // fields needed to decide whether a JWT is still valid. `status` is
  // included as defense in depth: a valid token should never exist for a
  // pending account (tokens are only issued on login/verify-otp once
  // Active), but this guards against that invariant ever being violated.
  async findAuthState(userId: string) {
    return this.userModel
      .findById(userId)
      .select('isActive status passwordChangedAt');
  }

  async getProfile(userId: string) {
    return this.userModel.findById(userId).select('-password');
  }

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    return this.userModel
      .findByIdAndUpdate(userId, updateProfileDto, {
        new: true,
      })
      .select('-password');
  }

  async updateAvatar(userId: string, avatar: string) {
    const existing = await this.userModel.findById(userId).select('avatar');
    const previousAvatar = existing?.avatar;

    const user = await this.userModel.findByIdAndUpdate(
      userId,
      {
        avatar,
      },
      {
        new: true,
      },
    );

    // The new avatar is already linked at this point — only now is it safe
    // to remove the old file. A failed cleanup shouldn't fail an otherwise
    // successful upload; it just leaves an orphaned object behind.
    await this.deleteOldAvatar(previousAvatar);

    return user;
  }

  async removeAvatar(userId: string) {
    const existing = await this.userModel.findById(userId).select('avatar');
    const previousAvatar = existing?.avatar;

    await this.userModel.findByIdAndUpdate(userId, { avatar: '' });

    await this.deleteOldAvatar(previousAvatar);

    return { message: 'Avatar removed successfully' };
  }

  private async deleteOldAvatar(url?: string | null) {
    if (!url) {
      return;
    }

    try {
      await this.storageProvider.deleteByUrl(url);
    } catch (error) {
      this.logger.error(
        `Failed to delete previous avatar: ${url}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async count(): Promise<number> {
    return this.userModel.countDocuments();
  }

  async findById(id: string) {
    return this.userModel.findById(id).select('-password');
  }

  async findAll(query: AdminUserQueryDto) {
    const { page, limit, search, role, isActive, sort, order } = query;

    interface UserAdminFilter {
      $or?: Array<{ [field: string]: { $regex: string; $options: string } }>;
      role?: UserRole;
      isActive?: boolean;
    }

    const filter: UserAdminFilter = {};

    if (search) {
      filter.$or = [
        {
          fullName: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          email: {
            $regex: search,
            $options: 'i',
          },
        },
      ];
    }

    if (role) {
      filter.role = role;
    }

    if (isActive !== undefined) {
      filter.isActive = isActive;
    }

    // Mongoose's QueryFilter<User> is too deeply recursive for eslint's type-aware
    // checker to resolve here, though tsc itself type-checks it fine.

    const queryFilter = filter as QueryFilter<User>;

    const total = await this.userModel.countDocuments(queryFilter);

    const users = await this.userModel
      .find(queryFilter)
      .select('-password')
      .sort({
        [sort]: order === 'asc' ? 1 : -1,
      })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async blockUser(id: string) {
    return this.userModel.findByIdAndUpdate(
      id,
      {
        isActive: false,
      },
      {
        new: true,
      },
    );
  }

  async unblockUser(id: string) {
    return this.userModel.findByIdAndUpdate(
      id,
      {
        isActive: true,
      },
      {
        new: true,
      },
    );
  }

  async changeRole(id: string, role: UserRole) {
    return this.userModel.findByIdAndUpdate(
      id,
      {
        role,
      },
      {
        new: true,
      },
    );
  }

  // Callers are responsible for cascading everything that references this
  // user first (pets, tags, and everything that in turn references those —
  // see AdminService.cascadeDeleteUserData) — this only deletes the User
  // document itself and its avatar file.
  async deleteUser(id: string) {
    const user = await this.userModel.findByIdAndDelete(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.deleteOldAvatar(user.avatar);

    return {
      message: 'User deleted successfully',
    };
  }

  async monthlyRegistrations() {
    const months: number[] = new Array<number>(12).fill(0);

    const users = await this.userModel.find();

    users.forEach((user) => {
      const createdAt = user.get('createdAt') as Date | undefined;

      if (createdAt) {
        months[new Date(createdAt).getMonth()]++;
      }
    });

    return months;
  }

  async monthlyQrScans() {
    const months: number[] = new Array<number>(12).fill(0);

    const pets = await this.petModel.find();

    pets.forEach((pet) => {
      if (pet.lastScannedAt) {
        months[new Date(pet.lastScannedAt).getMonth()] += pet.scanCount;
      }
    });

    return months;
  }
}
