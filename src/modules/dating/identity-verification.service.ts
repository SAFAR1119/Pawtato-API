import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  IdentityVerification,
  IdentityVerificationDocument,
} from './schemas/identity-verification.schema';
import { IdentityVerificationStatus } from '../../common/enums/identity-verification-status.enum';
import { STORAGE_PROVIDER } from '../storage/storage.constants';
import type { StorageProvider } from '../storage/interfaces/storage-provider.interface';
import { ActivityService } from '../activity/activity.service';
import type { AdminIdentityVerificationQueryDto } from '../admin/dto/admin-identity-verification-query.dto';

// How long a signed NID read URL stays valid — long enough to load in a
// screen, short enough that a copied link is useless a few minutes later.
const NID_SIGNED_URL_TTL_SECONDS = 5 * 60;

@Injectable()
export class IdentityVerificationService {
  constructor(
    @InjectModel(IdentityVerification.name)
    private readonly verificationModel: Model<IdentityVerificationDocument>,

    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,

    private readonly activityService: ActivityService,
  ) {}

  async submit(
    userId: string,
    front: Express.Multer.File,
    back: Express.Multer.File,
  ) {
    const existing = await this.verificationModel.findOne({
      userId: new Types.ObjectId(userId),
    });

    if (existing?.status === IdentityVerificationStatus.APPROVED) {
      throw new BadRequestException(
        'Your identity is already verified. Contact support if you need to change it.',
      );
    }

    const [nidFrontKey, nidBackKey] = await Promise.all([
      this.storageProvider.uploadPrivate({
        buffer: front.buffer,
        folder: 'identity-verification',
        originalName: front.originalname,
        mimetype: front.mimetype,
      }),
      this.storageProvider.uploadPrivate({
        buffer: back.buffer,
        folder: 'identity-verification',
        originalName: back.originalname,
        mimetype: back.mimetype,
      }),
    ]);

    // Resubmission after a rejection — clean up the old files, don't leave
    // them orphaned on disk/S3.
    if (existing) {
      await Promise.all([
        this.storageProvider.deletePrivate(existing.nidFrontKey),
        this.storageProvider.deletePrivate(existing.nidBackKey),
      ]);

      existing.nidFrontKey = nidFrontKey;
      existing.nidBackKey = nidBackKey;
      existing.status = IdentityVerificationStatus.PENDING;
      existing.submittedAt = new Date();
      existing.reviewedBy = undefined;
      existing.reviewedAt = undefined;
      existing.rejectionReason = undefined;

      await existing.save();

      return existing;
    }

    return this.verificationModel.create({
      userId: new Types.ObjectId(userId),
      nidFrontKey,
      nidBackKey,
      status: IdentityVerificationStatus.PENDING,
    });
  }

  async getMyStatus(userId: string) {
    const verification = await this.verificationModel.findOne({
      userId: new Types.ObjectId(userId),
    });

    if (!verification) {
      return { status: null };
    }

    return {
      status: verification.status,
      submittedAt: verification.submittedAt,
      reviewedAt: verification.reviewedAt,
      rejectionReason: verification.rejectionReason,
    };
  }

  async isApproved(userId: string): Promise<boolean> {
    const verification = await this.verificationModel.findOne({
      userId: new Types.ObjectId(userId),
      status: IdentityVerificationStatus.APPROVED,
    });

    return !!verification;
  }

  // Batched membership check — same shape/purpose as
  // PetsService.findOwnersForPets, used together by DatingService.discover()'s
  // verifiedOnly filter.
  async getApprovedUserIds(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) {
      return new Set();
    }

    const approved = await this.verificationModel.distinct('userId', {
      userId: { $in: userIds.map((id) => new Types.ObjectId(id)) },
      status: IdentityVerificationStatus.APPROVED,
    });

    return new Set(approved.map((id) => id.toString()));
  }

  // Only ever called after the caller has already confirmed (via
  // getApprovedUserIds/isApproved) that this user is APPROVED — does not
  // re-check status itself, since callers need that check before this for
  // their own authorization logic anyway (see DatingService.getNidExchange).
  async getSignedNidUrls(userId: string) {
    const verification = await this.verificationModel.findOne({
      userId: new Types.ObjectId(userId),
      status: IdentityVerificationStatus.APPROVED,
    });

    if (!verification) {
      throw new NotFoundException('No approved identity verification found');
    }

    const [frontUrl, backUrl] = await Promise.all([
      this.storageProvider.getSignedUrl(
        verification.nidFrontKey,
        NID_SIGNED_URL_TTL_SECONDS,
      ),
      this.storageProvider.getSignedUrl(
        verification.nidBackKey,
        NID_SIGNED_URL_TTL_SECONDS,
      ),
    ]);

    return { frontUrl, backUrl };
  }

  // --- Admin ---

  async adminList(query: AdminIdentityVerificationQueryDto) {
    const { page, limit, status } = query;
    const filter = status ? { status } : {};

    const total = await this.verificationModel.countDocuments(filter);

    const verifications = await this.verificationModel
      .find(filter)
      .populate('userId', 'fullName email')
      .sort({ submittedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-nidFrontKey -nidBackKey');

    return {
      verifications,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Admin review images go through the same on-demand signed-URL pattern as
  // the matched-party exchange — never returned inline by adminList(). Every
  // call is audit-logged, same as the matched-party exchange in
  // DatingService.getNidExchange() — admins aren't exempt from the "who
  // viewed whose NID, when" trail.
  async adminGetSignedImages(actorId: string, id: string) {
    const verification = await this.verificationModel.findById(id);

    if (!verification) {
      throw new NotFoundException('Identity verification not found');
    }

    const [frontUrl, backUrl] = await Promise.all([
      this.storageProvider.getSignedUrl(
        verification.nidFrontKey,
        NID_SIGNED_URL_TTL_SECONDS,
      ),
      this.storageProvider.getSignedUrl(
        verification.nidBackKey,
        NID_SIGNED_URL_TTL_SECONDS,
      ),
    ]);

    await this.activityService.log(actorId, 'dating.nid.viewed', id, {
      context: 'admin-review',
    });

    return { frontUrl, backUrl };
  }

  async adminApprove(actorId: string, id: string) {
    const verification = await this.verificationModel.findByIdAndUpdate(
      id,
      {
        status: IdentityVerificationStatus.APPROVED,
        reviewedBy: new Types.ObjectId(actorId),
        reviewedAt: new Date(),
        rejectionReason: undefined,
      },
      { new: true },
    );

    if (!verification) {
      throw new NotFoundException('Identity verification not found');
    }

    await this.activityService.log(
      actorId,
      'dating.identity-verification.approved',
      id,
    );

    return verification;
  }

  async adminReject(actorId: string, id: string, reason: string) {
    const verification = await this.verificationModel.findByIdAndUpdate(
      id,
      {
        status: IdentityVerificationStatus.REJECTED,
        reviewedBy: new Types.ObjectId(actorId),
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
      { new: true },
    );

    if (!verification) {
      throw new NotFoundException('Identity verification not found');
    }

    await this.activityService.log(
      actorId,
      'dating.identity-verification.rejected',
      id,
      { reason },
    );

    return verification;
  }

  // --- Cascade delete (see AdminService.delete) ---

  async deleteForUser(userId: string) {
    const verification = await this.verificationModel.findOne({
      userId: new Types.ObjectId(userId),
    });

    if (!verification) {
      return { deletedCount: 0 };
    }

    await Promise.all([
      this.storageProvider.deletePrivate(verification.nidFrontKey),
      this.storageProvider.deletePrivate(verification.nidBackKey),
    ]);

    await this.verificationModel.deleteOne({ _id: verification._id });

    return { deletedCount: 1 };
  }
}
