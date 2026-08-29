import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';

import {
  PetDatingProfile,
  PetDatingProfileDocument,
} from './schemas/pet-dating-profile.schema';
import { Swipe, SwipeDocument } from './schemas/swipe.schema';
import { Match, MatchDocument } from './schemas/match.schema';
import { Message, MessageDocument } from './schemas/message.schema';
import {
  DatingReport,
  DatingReportDocument,
} from './schemas/dating-report.schema';
import { CreateDatingProfileDto } from './dto/create-dating-profile.dto';
import { UpdateDatingProfileDto } from './dto/update-dating-profile.dto';
import { DiscoverQueryDto } from './dto/discover-query.dto';
import { SwipeDto } from './dto/swipe.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateDatingReportDto } from './dto/create-dating-report.dto';
import { DatingChatNotificationService } from './dating-chat-notification.service';
import type { AdminDatingReportQueryDto } from '../admin/dto/admin-dating-report-query.dto';
import { DatingMode } from '../../common/enums/dating-mode.enum';
import { SwipeAction } from '../../common/enums/swipe-action.enum';
import { MatchStatus } from '../../common/enums/match-status.enum';
import { DatingReportStatus } from '../../common/enums/dating-report-status.enum';
import { isDuplicateKeyError } from '../../common/utils/mongo.util';
import { PetsService } from '../pets/pets.service';
import { MedicalService } from '../medical/medical.service';
import { VaccinationsService } from '../vaccinations/vaccinations.service';
import { ActivityService } from '../activity/activity.service';
import { IdentityVerificationService } from './identity-verification.service';
import { PetGender } from '../../common/enums/pet-gender.enum';
import { DOMAIN_EVENTS } from '../../common/events/domain-events';

// Only cats and dogs may opt into dating — Pet.species is a free-text field
// platform-wide (no enum enforced there), so this allow-list is local to
// this module rather than a change to the core Pet schema. Applies
// regardless of mode — PLAYDATE being "universal" means "any species pair
// among eligible species," not literally any species.
const DATABLE_SPECIES = ['cat', 'dog'];

// `pet.owner` is a plain ObjectId when unpopulated but a full document when
// populated via PetsService.findByIdAdmin — mirrors the same normalization
// tags.service.ts already needs for the same reason.
function extractOwnerId(owner: unknown): string {
  if (owner && typeof owner === 'object' && '_id' in owner) {
    return String(owner._id);
  }

  return String(owner);
}

// Stored in a fixed order (lower hex string first) so a lookup or a unique
// index never has to check both (petAId, petBId) and (petBId, petAId).
function canonicalPair(
  a: Types.ObjectId,
  b: Types.ObjectId,
): [Types.ObjectId, Types.ObjectId] {
  return a.toString() < b.toString() ? [a, b] : [b, a];
}

function oppositeGender(gender: PetGender): PetGender {
  return gender === PetGender.MALE ? PetGender.FEMALE : PetGender.MALE;
}

@Injectable()
export class DatingService {
  constructor(
    @InjectModel(PetDatingProfile.name)
    private readonly profileModel: Model<PetDatingProfileDocument>,
    @InjectModel(Swipe.name)
    private readonly swipeModel: Model<SwipeDocument>,
    @InjectModel(Match.name)
    private readonly matchModel: Model<MatchDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(DatingReport.name)
    private readonly datingReportModel: Model<DatingReportDocument>,

    private readonly petsService: PetsService,
    private readonly medicalService: MedicalService,
    private readonly vaccinationsService: VaccinationsService,
    private readonly activityService: ActivityService,
    private readonly identityVerificationService: IdentityVerificationService,
    private readonly datingChatNotificationService: DatingChatNotificationService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {}

  // The single authoritative place the dating-pool reset window is read
  // from — everything that needs to know whether a swipe has "expired"
  // (discover()'s exclusion set, swipe()'s re-swipe check) goes through
  // this, so the two can never drift apart. Configurable via
  // DATING_POOL_RESET_DAYS (default 3) rather than hardcoded.
  private getPoolResetCutoff(): Date {
    const resetDays = this.configService.get<number>('dating.poolResetDays', 3);

    return new Date(Date.now() - resetDays * 24 * 60 * 60 * 1000);
  }

  // Pets currently in an ACTIVE match with `petId` — excluded from that
  // pet's discover() pool unconditionally, regardless of how old (or
  // fresh) the originating swipe is. This is what makes the "active match
  // never reappears" rule take priority over the swipe reset window (see
  // discover()); an UNMATCHED match no longer counts, which is exactly
  // what hands the pair back to the normal swipe-reset rule after unmatch.
  private async getActiveMatchPartnerIds(
    petId: Types.ObjectId,
  ): Promise<Types.ObjectId[]> {
    const matches = await this.matchModel.find(
      {
        $or: [{ petAId: petId }, { petBId: petId }],
        status: MatchStatus.ACTIVE,
      },
      { petAId: 1, petBId: 1 },
    );

    return matches.map((match) =>
      match.petAId.equals(petId) ? match.petBId : match.petAId,
    );
  }

  private assertDatableSpecies(species: string) {
    if (!DATABLE_SPECIES.includes(species.trim().toLowerCase())) {
      throw new BadRequestException(
        'Dating is only available for cats and dogs',
      );
    }
  }

  // Computed live from real records, never stored on the profile itself —
  // only ever called when the profile's own owner has opted into
  // `shareHealthSummary` (see discover()/getProfile()). No spay/neuter
  // field exists anywhere in this codebase's Pet schema, so this reports
  // only what's actually derivable: vaccination currency and record counts.
  private async buildMedicalSummary(petId: string) {
    const [medicalRecords, vaccinations] = await Promise.all([
      this.medicalService.findAllByPet(petId),
      this.vaccinationsService.findAllByPet(petId),
    ]);

    const now = new Date();
    const vaccinationsUpToDate =
      vaccinations.length > 0 &&
      vaccinations.every((v) => v.nextDueDate >= now);

    const lastVaccinationDate = vaccinations.reduce<Date | null>(
      (latest, v) =>
        !latest || v.administeredDate > latest ? v.administeredDate : latest,
      null,
    );

    return {
      medicalRecordCount: medicalRecords.length,
      vaccinationCount: vaccinations.length,
      vaccinationsUpToDate,
      lastVaccinationDate,
    };
  }

  async createProfile(
    ownerId: string,
    petId: string,
    dto: CreateDatingProfileDto,
  ) {
    const pet = await this.petsService.findOwnedPet(ownerId, petId);
    this.assertDatableSpecies(pet.species);

    const existing = await this.profileModel.findOne({ petId: pet._id });

    if (existing) {
      throw new BadRequestException(
        'This pet already has a dating profile — use PATCH to update it',
      );
    }

    return this.profileModel.create({
      petId: pet._id,
      modes: dto.modes,
      bio: dto.bio,
      temperamentTags: dto.temperamentTags ?? [],
      likes: dto.likes ?? [],
      dislikes: dto.dislikes ?? [],
      photos: dto.photos,
      approxLocation: dto.approxLocation,
      shareHealthSummary: dto.shareHealthSummary ?? false,
    });
  }

  async updateProfile(
    ownerId: string,
    petId: string,
    dto: UpdateDatingProfileDto,
  ) {
    const pet = await this.petsService.findOwnedPet(ownerId, petId);
    const profile = await this.profileModel.findOne({ petId: pet._id });

    if (!profile) {
      throw new NotFoundException('Dating profile not found');
    }

    if (dto.modes !== undefined) {
      if (dto.modes.length === 0) {
        throw new BadRequestException(
          'At least one dating mode must stay enabled',
        );
      }
      profile.modes = dto.modes;
    }
    if (dto.bio !== undefined) profile.bio = dto.bio;
    if (dto.temperamentTags !== undefined)
      profile.temperamentTags = dto.temperamentTags;
    if (dto.likes !== undefined) profile.likes = dto.likes;
    if (dto.dislikes !== undefined) profile.dislikes = dto.dislikes;
    if (dto.photos !== undefined) profile.photos = dto.photos;
    if (dto.approxLocation !== undefined)
      profile.approxLocation = dto.approxLocation;
    if (dto.shareHealthSummary !== undefined)
      profile.shareHealthSummary = dto.shareHealthSummary;
    if (dto.isActive !== undefined) profile.isActive = dto.isActive;

    await profile.save();

    return profile;
  }

  // The only way `healthVerified` ever becomes true — deliberately not part
  // of create/update's accepted fields, since it's meant to reflect real
  // records existing, not the owner's say-so. "Cross-referencing" is
  // interpreted here as: at least one medical record AND one vaccination
  // record already exist for this pet.
  async verifyHealth(ownerId: string, petId: string) {
    const pet = await this.petsService.findOwnedPet(ownerId, petId);
    const profile = await this.profileModel.findOne({ petId: pet._id });

    if (!profile) {
      throw new NotFoundException('Dating profile not found');
    }

    if (!profile.modes.includes(DatingMode.BREEDING)) {
      throw new BadRequestException(
        'Health verification only applies to profiles with BREEDING enabled',
      );
    }

    const [medicalRecords, vaccinations] = await Promise.all([
      this.medicalService.findAll(ownerId, petId),
      this.vaccinationsService.findAll(ownerId, petId),
    ]);

    if (medicalRecords.length === 0 || vaccinations.length === 0) {
      throw new BadRequestException(
        'Add at least one medical record and one vaccination record for this pet before requesting health verification',
      );
    }

    profile.healthVerified = true;
    await profile.save();

    return profile;
  }

  // A pet's own full dating profile — used for "View full profile" and the
  // Matched Profile Detail screen. Viewable by anyone while active; the
  // owner can also view it while paused (isActive: false).
  async getProfile(viewerId: string, petId: string) {
    const profile = await this.profileModel
      .findOne({ petId: new Types.ObjectId(petId) })
      .populate('petId', 'name species breed profileImage');

    if (!profile) {
      throw new NotFoundException('Dating profile not found');
    }

    const ownerMap = await this.petsService.findOwnersForPets([petId]);
    const ownerId = ownerMap.get(petId);
    const isOwner = ownerId === viewerId;

    if (!profile.isActive && !isOwner) {
      throw new NotFoundException('Dating profile not found');
    }

    const [ownerVerified, medicalSummary] = await Promise.all([
      ownerId
        ? this.identityVerificationService.isApproved(ownerId)
        : Promise.resolve(false),
      profile.shareHealthSummary
        ? this.buildMedicalSummary(petId)
        : Promise.resolve(undefined),
    ]);

    return {
      ...profile.toObject(),
      ownerVerified,
      ...(medicalSummary ? { medicalSummary } : {}),
    };
  }

  async discover(ownerId: string, query: DiscoverQueryDto) {
    const { petId, mode, verifiedOnly, page, limit } = query;
    const pet = await this.petsService.findOwnedPet(ownerId, petId);
    const profile = await this.profileModel.findOne({ petId: pet._id });

    if (!profile) {
      throw new BadRequestException(
        'Create a dating profile for this pet first',
      );
    }

    if (!profile.isActive) {
      throw new BadRequestException(
        "Activate this pet's dating profile before discovering others",
      );
    }

    if (!profile.modes.includes(mode)) {
      throw new BadRequestException(
        `Enable ${mode} on this pet's dating profile before discovering in that mode`,
      );
    }

    if (
      verifiedOnly &&
      !(await this.identityVerificationService.isApproved(ownerId))
    ) {
      throw new BadRequestException(
        'Verify your identity to use the verified-only filter',
      );
    }

    // Priority order for pool eligibility (never let these drift apart —
    // see PAWTATO_FRONTEND_BLUEPRINT.md's Dating Pool Eligibility section):
    // 1. An ACTIVE match is excluded unconditionally, no matter how old the
    //    swipe that created it is — getActiveMatchPartnerIds() alone
    //    decides this, independent of the reset window below.
    // 2. Anything swiped on (LIKE or PASS) within the reset window is
    //    hidden — this is what makes a skipped pet disappear temporarily.
    // 3. Once a swipe is older than the reset window, it stops excluding —
    //    the pet is eligible again (this also covers "unmatch": an
    //    UNMATCHED match no longer counts in step 1, so the pair falls
    //    through to this same reset-window rule on the swipe that
    //    originally matched them).
    const [ownPetIds, recentlySwipedPetIds, activeMatchPartnerIds] =
      await Promise.all([
        this.petsService.findIdsForOwner(ownerId),
        this.swipeModel.distinct('toPetId', {
          fromPetId: pet._id,
          mode,
          updatedAt: { $gte: this.getPoolResetCutoff() },
        }),
        this.getActiveMatchPartnerIds(pet._id),
      ]);

    const excludeIds = new Set<string>([
      ...ownPetIds,
      ...recentlySwipedPetIds.map((id) => id.toString()),
      ...activeMatchPartnerIds.map((id) => id.toString()),
    ]);

    const profileFilter: Record<string, unknown> = {
      modes: mode,
      isActive: true,
    };

    // BREEDING is species-restricted AND strictly opposite-gender (Phase 12
    // — same-gender pets are never shown to each other in the breeding
    // pool, regardless of species match); PLAYDATE is universal — the
    // profile filter alone (modes + isActive) is enough there, since species
    // eligibility was already enforced once at profile-creation time.
    if (mode === DatingMode.BREEDING) {
      const eligiblePetIds = await this.petsService.findIdsBySpeciesAndGender(
        pet.species,
        oppositeGender(pet.gender),
      );
      const eligible = eligiblePetIds.filter((id) => !excludeIds.has(id));
      profileFilter.petId = {
        $in: eligible.map((id) => new Types.ObjectId(id)),
      };
    } else {
      profileFilter.petId = {
        $nin: [...excludeIds].map((id) => new Types.ObjectId(id)),
      };
    }

    let candidatePetIds = await this.profileModel.distinct(
      'petId',
      profileFilter,
    );

    if (verifiedOnly) {
      const ownerMap = await this.petsService.findOwnersForPets(
        candidatePetIds.map((id) => id.toString()),
      );
      const approvedOwners =
        await this.identityVerificationService.getApprovedUserIds([
          ...new Set(ownerMap.values()),
        ]);

      candidatePetIds = candidatePetIds.filter((id) =>
        approvedOwners.has(ownerMap.get(id.toString()) ?? ''),
      );
    }

    const filter = { petId: { $in: candidatePetIds } };

    const total = await this.profileModel.countDocuments(filter);

    // petId can populate to null for a profile whose pet was deleted via the
    // owner self-service path before the dating.PET_DELETED cascade caught up
    // (or for any pre-existing orphan from before that cascade existed) —
    // drop those rather than crashing on the unconditional `.petId._id` below.
    const profiles = (
      await this.profileModel
        .find(filter)
        .populate('petId', 'name species breed profileImage')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
    ).filter((p) => p.petId);

    const pageOwnerMap = await this.petsService.findOwnersForPets(
      profiles.map((p) =>
        (p.petId as unknown as { _id: Types.ObjectId })._id.toString(),
      ),
    );
    const approvedOnPage =
      await this.identityVerificationService.getApprovedUserIds([
        ...new Set(pageOwnerMap.values()),
      ]);

    const enriched = await Promise.all(
      profiles.map(async (p) => {
        const candidatePetId = (
          p.petId as unknown as { _id: Types.ObjectId }
        )._id.toString();
        const ownerId = pageOwnerMap.get(candidatePetId);

        const medicalSummary = p.shareHealthSummary
          ? await this.buildMedicalSummary(candidatePetId)
          : undefined;

        return {
          ...p.toObject(),
          ownerVerified: ownerId ? approvedOnPage.has(ownerId) : false,
          ...(medicalSummary ? { medicalSummary } : {}),
        };
      }),
    );

    return {
      profiles: enriched,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async swipe(ownerId: string, dto: SwipeDto) {
    if (dto.fromPetId === dto.toPetId) {
      throw new BadRequestException('A pet cannot swipe itself');
    }

    const fromPet = await this.petsService.findOwnedPet(ownerId, dto.fromPetId);
    const toPet = await this.petsService.findByIdAdmin(dto.toPetId);

    if (!toPet) {
      throw new NotFoundException('Pet not found');
    }

    // Two pets owned by the same person must never be able to match each
    // other — discover() already excludes the caller's own pets from the
    // candidate pool, but a client could still call swipe() directly with a
    // toPetId it never got from discover(), so this is re-checked here
    // server-side rather than trusted to have come through discover() first.
    if (extractOwnerId(toPet.owner) === ownerId) {
      throw new BadRequestException(
        'A pet cannot match with another pet owned by the same person',
      );
    }

    const [fromProfile, toProfile] = await Promise.all([
      this.profileModel.findOne({ petId: fromPet._id }),
      this.profileModel.findOne({ petId: toPet._id }),
    ]);

    if (!fromProfile || !fromProfile.isActive) {
      throw new BadRequestException(
        'Create and activate a dating profile for this pet first',
      );
    }

    if (!toProfile || !toProfile.isActive) {
      throw new BadRequestException('This pet is not available for matching');
    }

    if (!fromProfile.modes.includes(dto.mode)) {
      throw new BadRequestException(
        `Enable ${dto.mode} on this pet's dating profile before swiping in that mode`,
      );
    }

    if (!toProfile.modes.includes(dto.mode)) {
      throw new BadRequestException(
        `This pet is not available for ${dto.mode} matching`,
      );
    }

    // BREEDING is species-restricted and strictly opposite-gender; PLAYDATE
    // is universal — mirrors discover()'s pool rule exactly, re-checked here
    // since a client is never trusted to have honored discover()'s
    // filtering.
    if (dto.mode === DatingMode.BREEDING) {
      if (
        fromPet.species.trim().toLowerCase() !==
        toPet.species.trim().toLowerCase()
      ) {
        throw new BadRequestException(
          'BREEDING matches must be the same species',
        );
      }

      if (fromPet.gender === toPet.gender) {
        throw new BadRequestException(
          'BREEDING matches must be opposite genders',
        );
      }
    }

    // At most one Swipe row ever exists per (fromPetId, toPetId, mode) —
    // see swipe.schema.ts. A fresh/still-active one blocks a second swipe
    // the same way it always has; one that's aged past the dating-pool
    // reset window is upserted in place instead, which is what lets a
    // previously skipped/liked pet be swiped on again once it's reappeared
    // in discover().
    const existingSwipe = await this.swipeModel.findOne({
      fromPetId: fromPet._id,
      toPetId: toPet._id,
      mode: dto.mode,
    });

    let swipe: SwipeDocument;

    if (existingSwipe) {
      const updatedAt = (existingSwipe as unknown as { updatedAt: Date })
        .updatedAt;

      if (updatedAt >= this.getPoolResetCutoff()) {
        throw new BadRequestException(
          'You already swiped on this pet in this mode',
        );
      }

      existingSwipe.action = dto.action;
      await existingSwipe.save();
      swipe = existingSwipe;
    } else {
      try {
        swipe = await this.swipeModel.create({
          fromPetId: fromPet._id,
          toPetId: toPet._id,
          action: dto.action,
          mode: dto.mode,
        });
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw new BadRequestException(
            'You already swiped on this pet in this mode',
          );
        }

        throw error;
      }
    }

    if (dto.action !== SwipeAction.LIKE) {
      return { swipe, match: null };
    }

    const reciprocal = await this.swipeModel.findOne({
      fromPetId: toPet._id,
      toPetId: fromPet._id,
      action: SwipeAction.LIKE,
      mode: dto.mode,
    });

    if (!reciprocal) {
      return { swipe, match: null };
    }

    const [petAId, petBId] = canonicalPair(fromPet._id, toPet._id);

    let match: MatchDocument;
    let isNewMatch: boolean;

    try {
      match = await this.matchModel.create({ petAId, petBId });
      isNewMatch = true;
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      // Two near-simultaneous swipe requests both detected the reciprocal
      // like and raced to create the match — the loser here isn't wrong,
      // the winner's document is just the one that stuck. Return it rather
      // than erroring, so both callers see the same successful outcome.
      // `isNewMatch` stays false on this path — see below for why that
      // matters for the DATING_MATCH_CREATED event.
      const existing = await this.matchModel.findOne({ petAId, petBId });

      if (!existing) {
        throw error;
      }

      match = existing;
      isNewMatch = false;
    }

    // Only the swipe request that actually inserted the Match fires the
    // event — the race-loser branch above (and any later re-swipe on an
    // already-matched pair) resolves to the same Match document without
    // re-emitting, so a retried/duplicate request can never produce a
    // second match-created notification for the same match (see
    // DomainEventsListener.onDatingMatchCreated).
    if (isNewMatch) {
      const fromIsA = match.petAId.equals(fromPet._id);
      const toOwnerId = extractOwnerId(toPet.owner);

      this.eventEmitter.emit(DOMAIN_EVENTS.DATING_MATCH_CREATED, {
        matchId: match._id.toString(),
        petAId: match.petAId.toString(),
        petBId: match.petBId.toString(),
        ownerAId: fromIsA ? ownerId : toOwnerId,
        ownerBId: fromIsA ? toOwnerId : ownerId,
        petAName: fromIsA ? fromPet.name : toPet.name,
        petBName: fromIsA ? toPet.name : fromPet.name,
      });
    }

    return { swipe, match };
  }

  async listMatches(ownerId: string) {
    const ownPetIds = (await this.petsService.findIdsForOwner(ownerId)).map(
      (id) => new Types.ObjectId(id),
    );

    const matches = await this.matchModel
      .find({
        $or: [{ petAId: { $in: ownPetIds } }, { petBId: { $in: ownPetIds } }],
        // Active matches always show; an unmatched (archived) one still
        // shows too, unless the caller has explicitly deleted it (see
        // deleteChat()) — a deleted conversation drops out of the list for
        // that user only, the other side (if they haven't also deleted it)
        // still sees it.
        deletedBy: { $ne: new Types.ObjectId(ownerId) },
      })
      .populate('petAId', 'name species breed profileImage')
      .populate('petBId', 'name species breed profileImage')
      .sort({ matchedAt: -1 });

    // `mode` isn't stored on Match itself (see PAWTATO_ROADMAP.md Phase 11)
    // — reconstructed from the originating reciprocal-LIKE Swipe pair for
    // display purposes (e.g. the frontend's Matches List mode icon).
    // Same orphaned-petId guard as discover() — see comment there.
    return Promise.all(
      matches
        .filter((match) => match.petAId && match.petBId)
        .map(async (match) => {
          const petA = match.petAId as unknown as { _id: Types.ObjectId };
          const petB = match.petBId as unknown as { _id: Types.ObjectId };

          const originatingSwipe = await this.swipeModel
            .findOne({
              $or: [
                {
                  fromPetId: petA._id,
                  toPetId: petB._id,
                  action: SwipeAction.LIKE,
                },
                {
                  fromPetId: petB._id,
                  toPetId: petA._id,
                  action: SwipeAction.LIKE,
                },
              ],
            })
            .sort({ createdAt: 1 });

          return {
            ...match.toObject(),
            mode: originatingSwipe?.mode ?? null,
          };
        }),
    );
  }

  private async getMatchOrThrow(matchId: string) {
    const match = await this.matchModel.findById(matchId);

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    return match;
  }

  // IDOR-safe by design (matches the rest of the codebase's convention):
  // a caller who doesn't own either side gets the same 404 as a nonexistent
  // match id, never a distinguishing 403.
  private async assertOwnsSideOfMatch(ownerId: string, match: MatchDocument) {
    const [petA, petB] = await Promise.all([
      this.petsService.findByIdAdmin(match.petAId.toString()),
      this.petsService.findByIdAdmin(match.petBId.toString()),
    ]);

    const ownsA = petA && extractOwnerId(petA.owner) === ownerId;
    const ownsB = petB && extractOwnerId(petB.owner) === ownerId;

    if (!ownsA && !ownsB) {
      throw new NotFoundException('Match not found');
    }
  }

  // Public entry point for DatingGateway (Phase 12) — a socket trying to
  // join a match's room needs the exact same IDOR-safe ownership check
  // every REST match-scoped endpoint already gets, without duplicating the
  // logic. Throws NotFoundException on failure, same as the REST path.
  async assertCanAccessMatch(ownerId: string, matchId: string) {
    const match = await this.getMatchOrThrow(matchId);
    await this.assertOwnsSideOfMatch(ownerId, match);
  }

  // Batched owner lookup for a match's two sides — used to address the
  // DATING_MESSAGE_SENT/DATING_MATCH_UNMATCHED events at both owners'
  // personal socket rooms (see DatingGateway), not just the match room,
  // since the recipient may not have that match room open at all.
  private async resolveMatchOwners(
    match: MatchDocument,
  ): Promise<{ ownerAId: string; ownerBId: string }> {
    const ownerMap = await this.petsService.findOwnersForPets([
      match.petAId.toString(),
      match.petBId.toString(),
    ]);

    return {
      ownerAId: ownerMap.get(match.petAId.toString()) ?? '',
      ownerBId: ownerMap.get(match.petBId.toString()) ?? '',
    };
  }

  async listMessages(ownerId: string, matchId: string) {
    const match = await this.getMatchOrThrow(matchId);
    await this.assertOwnsSideOfMatch(ownerId, match);

    return this.messageModel.find({ matchId: match._id }).sort({
      createdAt: 1,
    });
  }

  async sendMessage(ownerId: string, matchId: string, dto: CreateMessageDto) {
    const match = await this.getMatchOrThrow(matchId);
    await this.assertOwnsSideOfMatch(ownerId, match);

    if (match.status !== MatchStatus.ACTIVE) {
      throw new BadRequestException('This match has ended');
    }

    const message = await this.messageModel.create({
      matchId: match._id,
      senderUserId: new Types.ObjectId(ownerId),
      content: dto.content,
    });

    // Signals the match's Socket.IO room (DatingGateway) so the other side
    // sees this instantly, whether it was sent over the socket or, as here,
    // the plain REST endpoint — see the DOMAIN_EVENTS note on why this stays
    // decoupled from the gateway rather than DatingService depending on it.
    const { ownerAId, ownerBId } = await this.resolveMatchOwners(match);

    this.eventEmitter.emit(DOMAIN_EVENTS.DATING_MESSAGE_SENT, {
      matchId: match._id.toString(),
      messageId: message._id.toString(),
      senderUserId: ownerId,
      content: message.content,
      createdAt: (message as unknown as { createdAt: Date }).createdAt,
      ownerAId,
      ownerBId,
      petAId: match.petAId.toString(),
      petBId: match.petBId.toString(),
    });

    return message;
  }

  // "Opening the chat" (see PAWTATO_FRONTEND_BLUEPRINT.md's Dating Chat
  // Notifications contract) — deletes every currently-unread
  // DatingChatNotification for this caller in this conversation. Same
  // IDOR-safe ownership check as every other matches/:matchId/... action;
  // the actual delete is delegated to DatingChatNotificationService, which
  // owns that collection exclusively.
  async markChatRead(ownerId: string, matchId: string) {
    const match = await this.getMatchOrThrow(matchId);
    await this.assertOwnsSideOfMatch(ownerId, match);

    const { deletedCount } =
      await this.datingChatNotificationService.markConversationRead(
        ownerId,
        matchId,
      );

    return { message: 'Conversation marked as read', deletedCount };
  }

  async unmatch(ownerId: string, matchId: string) {
    const match = await this.getMatchOrThrow(matchId);
    await this.assertOwnsSideOfMatch(ownerId, match);

    if (match.status === MatchStatus.UNMATCHED) {
      return { message: 'Already unmatched' };
    }

    match.status = MatchStatus.UNMATCHED;
    match.unmatchedBy = new Types.ObjectId(ownerId);
    match.unmatchedAt = new Date();
    await match.save();

    // Archives the chat for both sides: no new messages can be sent (see
    // sendMessage()'s ACTIVE check) but the full history stays readable
    // (see listMessages()) — this event just tells any open socket
    // connection to reflect that immediately (e.g. disable the composer,
    // show "This match has ended").
    const { ownerAId, ownerBId } = await this.resolveMatchOwners(match);

    this.eventEmitter.emit(DOMAIN_EVENTS.DATING_MATCH_UNMATCHED, {
      matchId: match._id.toString(),
      petAId: match.petAId.toString(),
      petBId: match.petBId.toString(),
      unmatchedBy: ownerId,
      ownerAId,
      ownerBId,
    });

    return { message: 'Unmatched successfully' };
  }

  // "Delete conversation" (Phase 12) — a per-side hide, not a hard delete.
  // Only allowed once the match is already UNMATCHED (deleting an active
  // conversation out from under the other party isn't allowed — unmatch
  // first). The underlying Match/Message documents are always kept, even
  // once both sides have deleted, so a DatingReport referencing this match
  // can still be reviewed with full context later.
  async deleteChat(ownerId: string, matchId: string) {
    const match = await this.getMatchOrThrow(matchId);
    await this.assertOwnsSideOfMatch(ownerId, match);

    if (match.status !== MatchStatus.UNMATCHED) {
      throw new BadRequestException(
        'Unmatch before deleting this conversation',
      );
    }

    const userObjectId = new Types.ObjectId(ownerId);

    if (!match.deletedBy.some((id) => id.equals(userObjectId))) {
      match.deletedBy.push(userObjectId);
      await match.save();
    }

    return { message: 'Conversation deleted' };
  }

  // Explicit per-match consent (decided 2026-08-25 — see PAWTATO_ROADMAP.md
  // Phase 11): sharing is per-direction and scoped to this one match only.
  // Requires the caller to be APPROVED (they must have an NID on file to
  // share it at all).
  async shareNid(ownerId: string, matchId: string) {
    const match = await this.getMatchOrThrow(matchId);
    await this.assertOwnsSideOfMatch(ownerId, match);

    if (!(await this.identityVerificationService.isApproved(ownerId))) {
      throw new BadRequestException(
        'Verify your identity before sharing it in a match',
      );
    }

    const userObjectId = new Types.ObjectId(ownerId);

    if (!match.nidSharedBy.some((id) => id.equals(userObjectId))) {
      match.nidSharedBy.push(userObjectId);
      await match.save();
    }

    await this.activityService.log(ownerId, 'dating.nid.shared', matchId);

    return { message: 'Your ID is now shared in this match.' };
  }

  // Returns the *other* party's signed NID URLs — only once they've shared
  // (shareNid()) and are still currently APPROVED. The caller must also be
  // APPROVED themselves (the "Identity Sharing" section doesn't exist for
  // an ineligible match at all — see PAWTATO_FRONTEND_BLUEPRINT.md).
  async getNidExchange(ownerId: string, matchId: string) {
    const match = await this.getMatchOrThrow(matchId);
    await this.assertOwnsSideOfMatch(ownerId, match);

    if (!(await this.identityVerificationService.isApproved(ownerId))) {
      throw new BadRequestException(
        'You must be verified to view identity exchange in this match',
      );
    }

    const [petA, petB] = await Promise.all([
      this.petsService.findByIdAdmin(match.petAId.toString()),
      this.petsService.findByIdAdmin(match.petBId.toString()),
    ]);

    const ownsA = petA && extractOwnerId(petA.owner) === ownerId;
    const otherPet = ownsA ? petB : petA;

    if (!otherPet) {
      throw new NotFoundException('Match not found');
    }

    const otherOwnerId = extractOwnerId(otherPet.owner);

    const hasShared = match.nidSharedBy.some(
      (id) => id.toString() === otherOwnerId,
    );

    if (!hasShared) {
      throw new BadRequestException(
        'The other side has not shared their ID in this match yet',
      );
    }

    if (!(await this.identityVerificationService.isApproved(otherOwnerId))) {
      throw new BadRequestException('The other side is no longer verified');
    }

    const urls =
      await this.identityVerificationService.getSignedNidUrls(otherOwnerId);

    await this.activityService.log(ownerId, 'dating.nid.viewed', matchId, {
      viewedOwnerId: otherOwnerId,
    });

    return urls;
  }

  async report(reporterId: string, dto: CreateDatingReportDto) {
    const targetPet = await this.petsService.findByIdAdmin(dto.targetPetId);

    if (!targetPet) {
      throw new NotFoundException('Pet not found');
    }

    const profile = await this.profileModel.findOne({
      petId: targetPet._id,
    });

    if (!profile) {
      throw new NotFoundException('This pet has no dating profile to report');
    }

    let matchObjectId: Types.ObjectId | null = null;

    // Reporting from inside a chat: the caller must own one side of the
    // match, and the reported pet must genuinely be the *other* side — not
    // just any pet that happens to appear in the match, which would let a
    // reporter attach match context while naming their own pet as the
    // target.
    if (dto.matchId) {
      const match = await this.getMatchOrThrow(dto.matchId);
      await this.assertOwnsSideOfMatch(reporterId, match);

      const [petA, petB] = await Promise.all([
        this.petsService.findByIdAdmin(match.petAId.toString()),
        this.petsService.findByIdAdmin(match.petBId.toString()),
      ]);

      const ownsA = petA && extractOwnerId(petA.owner) === reporterId;
      const otherPet = ownsA ? petB : petA;

      if (!otherPet || !otherPet._id.equals(targetPet._id)) {
        throw new BadRequestException(
          'targetPetId must be the other side of this match',
        );
      }

      matchObjectId = match._id;
    }

    const report = await this.datingReportModel.create({
      reporterUserId: new Types.ObjectId(reporterId),
      targetPetId: targetPet._id,
      reason: dto.reason,
      matchId: matchObjectId,
    });

    await this.activityService.log(
      reporterId,
      'dating.report.created',
      report._id.toString(),
      { targetPetId: dto.targetPetId, matchId: dto.matchId ?? null },
    );

    return { message: 'Report submitted. Our team will review it.' };
  }

  // Admin-only, on-demand chat context for a filed report — mirrors the NID
  // signed-image pattern exactly (never inline in the report list, fetched
  // only when an admin actually opens it, and audit-logged every time).
  // Only meaningful for a report that was filed with matchId set; a
  // profile-only report has no conversation to show.
  async adminGetReportMessages(actorId: string, reportId: string) {
    const report = await this.datingReportModel.findById(reportId);

    if (!report) {
      throw new NotFoundException('Dating report not found');
    }

    if (!report.matchId) {
      throw new BadRequestException(
        'This report has no associated conversation',
      );
    }

    const messages = await this.messageModel
      .find({ matchId: report.matchId })
      .sort({ createdAt: 1 });

    await this.activityService.log(actorId, 'dating.chat.viewed', reportId, {
      matchId: report.matchId.toString(),
      context: 'report-review',
    });

    return messages;
  }

  // --- Admin ---

  async adminListReports(query: AdminDatingReportQueryDto) {
    const { page, limit, status } = query;
    const filter = status ? { status } : {};

    const total = await this.datingReportModel.countDocuments(filter);

    const reports = await this.datingReportModel
      .find(filter)
      .populate('targetPetId', 'name species')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      reports,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async adminUpdateReportStatus(
    actorId: string,
    id: string,
    status: DatingReportStatus,
  ) {
    const report = await this.datingReportModel.findByIdAndUpdate(
      id,
      {
        status,
        reviewedBy: new Types.ObjectId(actorId),
        reviewedAt: new Date(),
      },
      { new: true },
    );

    if (!report) {
      throw new NotFoundException('Dating report not found');
    }

    await this.activityService.log(
      actorId,
      'dating.report.status-changed',
      id,
      { status },
    );

    return report;
  }

  async adminDeactivateProfile(actorId: string, petId: string) {
    const profile = await this.profileModel.findOneAndUpdate(
      { petId: new Types.ObjectId(petId) },
      { isActive: false },
      { new: true },
    );

    if (!profile) {
      throw new NotFoundException('Dating profile not found');
    }

    await this.activityService.log(
      actorId,
      'admin.dating-profile.deactivated',
      petId,
    );

    return profile;
  }

  // --- Cascade delete (see AdminService.cascadeDeleteUserData / deletePet) ---

  // PetsService.remove() (owner self-service delete) has no explicit cascade
  // like AdminService.deletePet does, so it fires this event instead. Without
  // it, a self-deleted pet's dating profile/swipes/matches would linger with
  // a petId that no longer resolves — .populate('petId') then returns null
  // for that document, and any code that dereferences it unconditionally
  // (e.g. discover(), listMatches()) throws.
  @OnEvent(DOMAIN_EVENTS.PET_DELETED)
  async handlePetDeleted(payload: { petId: string; ownerId: string }) {
    await this.deleteAllForPets([payload.petId]);
  }

  async deleteAllForPets(petIds: string[]) {
    if (petIds.length === 0) {
      return { deletedCount: 0 };
    }

    const objectIds = petIds.map((id) => new Types.ObjectId(id));

    const matches = await this.matchModel.find({
      $or: [{ petAId: { $in: objectIds } }, { petBId: { $in: objectIds } }],
    });
    const matchIds = matches.map((match) => match._id);

    await this.messageModel.deleteMany({ matchId: { $in: matchIds } });
    await this.matchModel.deleteMany({ _id: { $in: matchIds } });
    await this.swipeModel.deleteMany({
      $or: [{ fromPetId: { $in: objectIds } }, { toPetId: { $in: objectIds } }],
    });
    await this.datingReportModel.deleteMany({
      targetPetId: { $in: objectIds },
    });
    // deleteAllForMatches covers notifications for the *other* pet in each
    // deleted match (not itself in petIds); deleteAllForPets covers any
    // stray row referencing these petIds directly (belt-and-braces — every
    // row should already be caught by one match in matchIds above).
    await this.datingChatNotificationService.deleteAllForMatches(matchIds);
    await this.datingChatNotificationService.deleteAllForPets(petIds);

    const result = await this.profileModel.deleteMany({
      petId: { $in: objectIds },
    });

    return { deletedCount: result.deletedCount };
  }

  async deleteReportsByReporter(userId: string) {
    const result = await this.datingReportModel.deleteMany({
      reporterUserId: new Types.ObjectId(userId),
    });

    return { deletedCount: result.deletedCount };
  }
}
