import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';

import {
  FoundReport,
  FoundReportDocument,
} from './schemas/found-report.schema';
import { CreateFoundReportDto } from './dto/create-found-report.dto';
import { TagsService } from '../tags/tags.service';
import { PetsService } from '../pets/pets.service';
import { TagStatus } from '../../common/enums/tag-status.enum';
import { FoundReportStatus } from '../../common/enums/found-report-status.enum';
import { User } from '../users/schemas/user.schema';
import { PetDocument } from '../pets/schemas/pet.schema';
import { DOMAIN_EVENTS } from '../../common/events/domain-events';
import { ActivityService } from '../activity/activity.service';
import { STORAGE_PROVIDER } from '../storage/storage.constants';
import type { StorageProvider } from '../storage/interfaces/storage-provider.interface';
import type { AdminFoundReportQueryDto } from '../admin/dto/admin-found-report-query.dto';

interface PetWithOwner extends Omit<PetDocument, 'owner'> {
  owner: User & { _id: Types.ObjectId };
}

// This endpoint is anonymous/no-auth and reachable by anyone who can scan a
// physical tag — the deviceFingerprint the client sends is the only handle
// available to contain spam/abuse beyond the IP-based throttle already on
// the controller route. Two independent limits: a per-tag cooldown (stops a
// single finder hammering the same pet's owner with repeat submissions) and
// a broader per-fingerprint cap across all tags (stops one device farming
// reports/emails across many pets).
const SAME_TAG_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REPORTS_PER_WINDOW = 5;
const REPORTS_WINDOW_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class FoundReportsService {
  private readonly logger = new Logger(FoundReportsService.name);

  constructor(
    @InjectModel(FoundReport.name)
    private readonly foundReportModel: Model<FoundReportDocument>,

    private readonly tagsService: TagsService,
    private readonly petsService: PetsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly activityService: ActivityService,

    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  async create(
    publicCode: string,
    dto: CreateFoundReportDto,
    photoUrl?: string,
  ) {
    const tag = await this.tagsService.findByPublicCode(publicCode);

    if (tag.status !== TagStatus.ASSIGNED || !tag.assignedPetId) {
      throw new BadRequestException(
        'This tag is not currently linked to a pet',
      );
    }

    await this.assertNotSpamming(dto.deviceFingerprint, tag._id);

    const report = await this.foundReportModel.create({
      tag: tag._id,
      pet: tag.assignedPetId,
      message: dto.message,
      approxLocation: dto.approxLocation,
      contactInfo: dto.contactInfo,
      deviceFingerprint: dto.deviceFingerprint,
      photoUrl,
    });

    // The report is already saved at this point — a failed owner lookup must
    // never turn into a failure response for a finder who already succeeded.
    await this.emitCreatedEvent(tag.assignedPetId.toString(), report);

    return report;
  }

  private async emitCreatedEvent(petId: string, report: FoundReportDocument) {
    try {
      const pet = (await this.petsService.findWithOwner(
        petId,
      )) as PetWithOwner | null;

      const ownerEmail = pet?.owner?.email;
      const ownerId = pet?.owner?._id;

      if (!pet || !ownerEmail || !ownerId) {
        return;
      }

      this.eventEmitter.emit(DOMAIN_EVENTS.FOUND_REPORT_CREATED, {
        ownerId: String(ownerId),
        ownerEmail,
        ownerPhone: pet.owner.phone || undefined,
        petId,
        petName: pet.name,
        foundReportId: String(report._id),
        message: report.message,
        isLost: pet.isLost,
      });
    } catch (error) {
      this.logger.error(
        `Failed to emit found-report.created for report ${String(report._id)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async assertNotSpamming(
    deviceFingerprint: string,
    tagId: Types.ObjectId,
  ) {
    const now = Date.now();

    const recentForSameTag = await this.foundReportModel.exists({
      tag: tagId,
      deviceFingerprint,
      createdAt: { $gte: new Date(now - SAME_TAG_COOLDOWN_MS) },
    });

    if (recentForSameTag) {
      throw new HttpException(
        'You already reported this recently — please wait before submitting again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const recentCount = await this.foundReportModel.countDocuments({
      deviceFingerprint,
      createdAt: { $gte: new Date(now - REPORTS_WINDOW_MS) },
    });

    if (recentCount >= MAX_REPORTS_PER_WINDOW) {
      throw new HttpException(
        'Too many reports submitted from this device recently — please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // Admin abuse-review surface — global, unscoped by pet/tag ownership,
  // filterable by moderation status and/or deviceFingerprint (the latter is
  // the one signal available to spot a single device farming reports across
  // many different tags — see assertNotSpamming() above).
  async findAllAdmin(query: AdminFoundReportQueryDto) {
    const { page, limit, status, deviceFingerprint } = query;

    const filter: Record<string, unknown> = {};

    if (status) {
      filter.status = status;
    }

    if (deviceFingerprint) {
      filter.deviceFingerprint = deviceFingerprint;
    }

    const total = await this.foundReportModel.countDocuments(filter);

    const foundReports = await this.foundReportModel
      .find(filter)
      .populate('pet', 'name species')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      foundReports,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateStatus(id: string, actorId: string, status: FoundReportStatus) {
    const report = await this.foundReportModel.findByIdAndUpdate(
      id,
      {
        status,
        reviewedBy: new Types.ObjectId(actorId),
        reviewedAt: new Date(),
      },
      { new: true },
    );

    if (!report) {
      throw new NotFoundException('Found report not found');
    }

    await this.activityService.log(actorId, 'found-report.status-changed', id, {
      status,
    });

    return report;
  }

  // `ownerId` here is really "the acting user" — the owner or, since Phase
  // 15, an authorized caretaker. See PetsService.findAccessiblePet().
  //
  // Explicit ObjectId cast — found during Phase 16's audit for the same bug
  // class fixed in MedicalService/VaccinationsService: create() above
  // always stores `pet` as a real ObjectId (`tag.assignedPetId`, already
  // typed), so a raw-string filter here silently matched nothing.
  async findForOwnedPet(ownerId: string, petId: string) {
    await this.petsService.findAccessiblePet(ownerId, petId);

    return this.foundReportModel
      .find({ pet: new Types.ObjectId(petId) })
      .sort({ createdAt: -1 });
  }

  // Scoped to the tag itself (not whichever pet currently owns it) — a
  // report submitted while the tag was linked to an earlier pet still shows
  // up here, since it's the physical sticker's history, not the current
  // pet's. Keyed by `tag`, matching what create() stores.
  async findForOwnedTag(ownerId: string, tagId: string, isAdmin: boolean) {
    const tag = await this.tagsService.findOwnedById(ownerId, tagId, isAdmin);

    return this.foundReportModel.find({ tag: tag._id }).sort({ createdAt: -1 });
  }

  // Cascade delete — every found report tied to any of these pets or tags,
  // plus each report's stored photo. Called from AdminService when a pet, a
  // tag's owning pet, or a whole user (pets + tags together) is deleted.
  async deleteAllForPetsAndTags(petIds: string[], tagIds: string[]) {
    if (petIds.length === 0 && tagIds.length === 0) {
      return { deletedCount: 0 };
    }

    const filter = {
      $or: [
        { pet: { $in: petIds.map((id) => new Types.ObjectId(id)) } },
        { tag: { $in: tagIds.map((id) => new Types.ObjectId(id)) } },
      ],
    };

    const reports = await this.foundReportModel.find(filter).select('photoUrl');

    for (const report of reports) {
      if (!report.photoUrl) {
        continue;
      }

      try {
        await this.storageProvider.deleteByUrl(report.photoUrl);
      } catch (error) {
        this.logger.error(
          `Failed to delete found-report photo: ${report.photoUrl}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    const result = await this.foundReportModel.deleteMany(filter);

    return { deletedCount: result.deletedCount };
  }
}
