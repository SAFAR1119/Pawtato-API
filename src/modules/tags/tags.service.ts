import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';
import { nanoid } from 'nanoid';

import { Tag, TagDocument } from './schemas/tag.schema';
import { CreateTagDto } from './dto/create-tag.dto';
import { AssignTagDto } from './dto/assign-tag.dto';
import { UnassignTagDto } from './dto/unassign-tag.dto';
import { TagQueryDto } from './dto/tag-query.dto';
import { BulkCreateTagsDto } from './dto/bulk-create-tags.dto';
import { ClaimTagDto } from './dto/claim-tag.dto';
import { TagStatus } from '../../common/enums/tag-status.enum';
import { PetsService } from '../pets/pets.service';
import { QrService } from '../qr/qr.service';
import { ActivityService } from '../activity/activity.service';
import { DOMAIN_EVENTS } from '../../common/events/domain-events';
import { isDuplicateKeyError } from '../../common/utils/mongo.util';

const MAX_PUBLIC_CODE_COLLISION_RETRIES = 3;

// `pet.owner` is a plain ObjectId when unpopulated (the non-admin lookup) but
// a full document when populated (the admin lookup via findByIdAdmin) —
// normalize both to a string id rather than trusting Document.toString().
function extractOwnerId(owner: unknown): string {
  if (owner && typeof owner === 'object' && '_id' in owner) {
    return String(owner._id);
  }

  return String(owner);
}

@Injectable()
export class TagsService {
  private readonly logger = new Logger(TagsService.name);

  constructor(
    @InjectModel(Tag.name)
    private readonly tagModel: Model<TagDocument>,

    private readonly petsService: PetsService,
    private readonly qrService: QrService,
    private readonly activityService: ActivityService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // Shared by create() (self-service, owned from the start) and bulkCreate()
  // (admin-manufactured inventory, unowned until claimed) — both need the
  // same "generate a code, render its QR, retry on collision" mechanics,
  // differing only in what status/ownerId the resulting document gets.
  private async generateAndInsertTag(
    redirectBase: string,
    fields: {
      status: TagStatus;
      ownerId?: Types.ObjectId;
      batchLabel?: string;
    },
  ) {
    for (
      let attempt = 1;
      attempt <= MAX_PUBLIC_CODE_COLLISION_RETRIES;
      attempt++
    ) {
      const publicCode = nanoid(10);
      const linkUrl = `${redirectBase}/${publicCode}`;

      const qrImageUrl = await this.qrService.generate(publicCode, linkUrl);

      try {
        return await this.tagModel.create({
          publicCode,
          linkUrl,
          qrImageUrl,
          ...fields,
        });
      } catch (error) {
        // publicCode collisions are astronomically unlikely (nanoid(10) over
        // a 64-character alphabet) but not impossible — retry with a fresh
        // code rather than surfacing a raw 500 for something the caller had
        // no way to avoid. Any other error (including a stale/misconfigured
        // unique index — see DatabaseModule.onApplicationBootstrap) is
        // rethrown immediately rather than masked by retries.
        if (
          isDuplicateKeyError(error) &&
          attempt < MAX_PUBLIC_CODE_COLLISION_RETRIES
        ) {
          await this.qrService.delete(publicCode);
          continue;
        }

        throw error;
      }
    }

    // Unreachable — the loop always returns or throws — but keeps TS happy.
    throw new Error('Failed to create a unique tag after retrying');
  }

  // Self-service: any authenticated user creates their own tag directly (no
  // admin-seeded inventory to claim). The frontend supplies the route it
  // wants scans to land on (everything but the code); the backend generates
  // the code, builds the full link, and renders/stores the QR image for it.
  async create(ownerId: string, dto: CreateTagDto) {
    const redirectBase = dto.redirectBaseUrl.replace(/\/+$/, '');

    return this.generateAndInsertTag(redirectBase, {
      status: TagStatus.AVAILABLE,
      ownerId: new Types.ObjectId(ownerId),
    });
  }

  // Mints `count` unowned MANUFACTURED tags against a given redirect base —
  // the shared mechanics behind both bulkCreate() (admin print runs) and
  // TagOrdersService.handleCheckoutCompleted() (Phase 19 — a paid tag order
  // becomes real inventory the same way a manual admin batch does, so a
  // finished order shows up in the exact same GET /tags admin tooling).
  // Sequential by design: bounded, infrequent, and each insert's own
  // collision-retry already depends on observing prior inserts.
  async mintManufacturedBatch(
    count: number,
    redirectBaseUrl: string,
    batchLabel?: string,
  ): Promise<TagDocument[]> {
    const redirectBase = redirectBaseUrl.replace(/\/+$/, '');

    const tags: TagDocument[] = [];

    for (let i = 0; i < count; i++) {
      const tag = await this.generateAndInsertTag(redirectBase, {
        status: TagStatus.MANUFACTURED,
        batchLabel,
      });

      tags.push(tag);
    }

    return tags;
  }

  // Admin-only: manufactures a batch of unowned tags up front (a real print
  // run) — see mintManufacturedBatch() above for the shared mechanics.
  async bulkCreate(actorId: string, dto: BulkCreateTagsDto) {
    const tags = await this.mintManufacturedBatch(
      dto.count,
      dto.redirectBaseUrl,
      dto.batchLabel,
    );

    await this.activityService.log(actorId, 'tag.bulk-created', 'Tag', {
      count: tags.length,
      batchLabel: dto.batchLabel ?? null,
      tagIds: tags.map((tag) => tag._id.toString()),
    });

    return tags;
  }

  // Claims a piece of unowned, admin-manufactured inventory into the
  // caller's name — the missing link between bulkCreate() (no owner yet)
  // and assign() (requires an owned, AVAILABLE tag). A self-service-created
  // tag (from create()) never needs this: it's already owned and AVAILABLE.
  async claim(userId: string, dto: ClaimTagDto) {
    const tag = await this.tagModel.findOne({ publicCode: dto.publicCode });

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    if (tag.status !== TagStatus.MANUFACTURED || tag.ownerId) {
      throw new BadRequestException('This tag is not available to claim');
    }

    tag.ownerId = new Types.ObjectId(userId);
    tag.status = TagStatus.AVAILABLE;

    await tag.save();

    await this.activityService.log(userId, 'tag.claimed', tag._id.toString(), {
      publicCode: tag.publicCode,
    });

    return tag;
  }

  async findAll(query: TagQueryDto) {
    const { page, limit, status } = query;

    const filter = status ? { status } : {};

    const total = await this.tagModel.countDocuments(filter);

    const tags = await this.tagModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      tags,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Every tag the caller owns, regardless of status — a newly-created,
  // not-yet-linked tag needs to show up here too, not just ones currently
  // assigned to a pet. Manufactured-but-unclaimed tags (ownerId null) never
  // match, correctly — they don't belong to anyone yet.
  async findMine(ownerId: string) {
    return this.tagModel
      .find({ ownerId: new Types.ObjectId(ownerId) })
      .sort({ createdAt: -1 });
  }

  async findOne(id: string) {
    const tag = await this.tagModel.findById(id);

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    return tag;
  }

  async findByPublicCode(publicCode: string) {
    const tag = await this.tagModel.findOne({ publicCode });

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    return tag;
  }

  private assertOwnsTag(tag: TagDocument, callerId: string, isAdmin: boolean) {
    if (isAdmin) {
      return;
    }

    if (!tag.ownerId || !tag.ownerId.equals(callerId)) {
      throw new ForbiddenException('You do not own this tag');
    }
  }

  // Ownership-checked lookup by Mongo id, shared with anything else that
  // needs to act on a specific tag the caller owns (e.g.
  // FoundReportsService.findForOwnedTag) without duplicating the
  // owner-vs-admin check.
  async findOwnedById(ownerId: string, id: string, isAdmin: boolean) {
    const tag = await this.findOne(id);

    this.assertOwnsTag(tag, ownerId, isAdmin);

    return tag;
  }

  async assign(ownerId: string, dto: AssignTagDto, isAdmin: boolean) {
    const tag = await this.tagModel.findOne({ publicCode: dto.publicCode });

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    this.assertOwnsTag(tag, ownerId, isAdmin);

    if (tag.status !== TagStatus.AVAILABLE) {
      throw new BadRequestException('This tag is not available for assignment');
    }

    const pet = await this.petsService.findOwnedPet(ownerId, dto.petId);

    const existingActiveTag = await this.tagModel.findOne({
      assignedPetId: pet._id,
      status: TagStatus.ASSIGNED,
    });

    if (existingActiveTag) {
      throw new BadRequestException(
        'This pet already has an active tag. Unassign it before assigning a new one.',
      );
    }

    tag.status = TagStatus.ASSIGNED;
    tag.assignedPetId = pet._id;
    tag.assignedAt = new Date();
    tag.unassignedAt = undefined;

    await tag.save();

    const eventPayload = {
      ownerId,
      tagId: tag._id.toString(),
      publicCode: tag.publicCode,
      petId: pet._id.toString(),
      petName: pet.name,
    };

    this.eventEmitter.emit(DOMAIN_EVENTS.TAG_ASSIGNED, eventPayload);

    await this.activityService.log(
      ownerId,
      DOMAIN_EVENTS.TAG_ASSIGNED,
      tag._id.toString(),
      eventPayload,
    );

    return tag;
  }

  async unassign(ownerId: string, dto: UnassignTagDto, isAdmin: boolean) {
    const tag = await this.tagModel.findOne({ publicCode: dto.publicCode });

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    this.assertOwnsTag(tag, ownerId, isAdmin);

    if (tag.status !== TagStatus.ASSIGNED || !tag.assignedPetId) {
      throw new BadRequestException(
        'This tag is not currently assigned to a pet',
      );
    }

    const pet = await this.petsService.findByIdAdmin(
      tag.assignedPetId.toString(),
    );

    tag.status = TagStatus.AVAILABLE;
    tag.assignedPetId = null;
    tag.unassignedAt = new Date();

    await tag.save();

    if (pet) {
      const eventPayload = {
        ownerId: extractOwnerId(pet.owner),
        tagId: tag._id.toString(),
        publicCode: tag.publicCode,
        petId: pet._id.toString(),
        petName: pet.name,
      };

      this.eventEmitter.emit(DOMAIN_EVENTS.TAG_UNASSIGNED, eventPayload);
    }

    await this.activityService.log(
      ownerId,
      DOMAIN_EVENTS.TAG_UNASSIGNED,
      tag._id.toString(),
      { publicCode: tag.publicCode, petId: pet?._id.toString() ?? null },
    );

    return tag;
  }

  // Owner-facing hard delete — permanently destroys the tag (and its QR
  // image), so a scan of the physical sticker afterward resolves to nothing.
  // If it's currently linked to a pet, that link is cleared first rather
  // than blocking the delete on an explicit unassign step.
  async delete(ownerId: string, id: string, isAdmin: boolean) {
    const tag = await this.findOne(id);

    this.assertOwnsTag(tag, ownerId, isAdmin);

    if (tag.status === TagStatus.ASSIGNED && tag.assignedPetId) {
      const pet = await this.petsService.findByIdAdmin(
        tag.assignedPetId.toString(),
      );

      if (pet) {
        this.eventEmitter.emit(DOMAIN_EVENTS.TAG_UNASSIGNED, {
          ownerId: extractOwnerId(pet.owner),
          tagId: tag._id.toString(),
          publicCode: tag.publicCode,
          petId: pet._id.toString(),
          petName: pet.name,
        });
      }
    }

    await this.qrService.delete(tag.publicCode);
    await this.tagModel.findByIdAndDelete(tag._id);

    await this.activityService.log(ownerId, 'tag.deleted', id, {
      publicCode: tag.publicCode,
    });

    return { message: 'Tag deleted successfully' };
  }

  async suspend(id: string, actorId: string) {
    const tag = await this.findOne(id);

    if (tag.status === TagStatus.RETIRED) {
      throw new BadRequestException('A retired tag cannot be suspended');
    }

    tag.status = TagStatus.SUSPENDED;

    await tag.save();

    await this.activityService.log(
      actorId,
      'tag.suspended',
      tag._id.toString(),
      { publicCode: tag.publicCode },
    );

    return tag;
  }

  async retire(id: string, actorId: string) {
    const tag = await this.findOne(id);

    tag.status = TagStatus.RETIRED;
    tag.assignedPetId = null;

    await tag.save();

    await this.activityService.log(actorId, 'tag.retired', tag._id.toString(), {
      publicCode: tag.publicCode,
    });

    return tag;
  }

  // Read-only id lookups used by AdminService to compute the full set of
  // tags/pets affected by a cascade *before* deleting anything — see
  // AdminService.cascadeDeleteUserData/deletePet. Kept separate from the
  // delete methods below so a crash mid-cascade can always re-derive the
  // same ids on retry, rather than silently losing track of what's left to
  // clean up because the tags/pets that would answer "whose data is this"
  // are already gone.
  async findIdsForOwner(ownerId: string): Promise<string[]> {
    const ids = await this.tagModel.distinct('_id', {
      ownerId: new Types.ObjectId(ownerId),
    });

    return ids.map((id) => id.toString());
  }

  async findIdsForPet(petId: string): Promise<string[]> {
    const ids = await this.tagModel.distinct('_id', {
      assignedPetId: new Types.ObjectId(petId),
    });

    return ids.map((id) => id.toString());
  }

  // Cascade delete — permanently removes every tag matching `filter`, along
  // with each one's QR image. Unlike delete()/unassign(), this never emits a
  // domain event: those exist to notify a tag's owner that something
  // changed, and this only ever runs as part of deleting that same owner (or
  // one of their pets), so there's no one left for a notification to reach.
  private async deleteTagsMatching(filter: Record<string, unknown>) {
    const tags = await this.tagModel.find(filter);

    for (const tag of tags) {
      try {
        await this.qrService.delete(tag.publicCode);
      } catch (error) {
        this.logger.error(
          `Failed to delete QR image for tag ${tag._id.toString()}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    await this.tagModel.deleteMany(filter);

    return { deletedCount: tags.length };
  }

  // Every tag the user owns, assigned or not — called when an admin deletes
  // the user (see AdminService.cascadeDeleteUserData).
  async deleteAllForOwner(ownerId: string) {
    return this.deleteTagsMatching({ ownerId: new Types.ObjectId(ownerId) });
  }

  // Whichever tag is currently assigned to this one pet — called when an
  // admin deletes a single pet (see AdminService.deletePet). Deliberately
  // scoped to assignedPetId, not ownerId: deleting one pet must not touch
  // the same owner's other, unrelated tags.
  async deleteAllForPet(petId: string) {
    return this.deleteTagsMatching({
      assignedPetId: new Types.ObjectId(petId),
    });
  }
}
