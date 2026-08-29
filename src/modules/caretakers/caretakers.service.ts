import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { OnEvent } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';

import {
  PetCaretaker,
  PetCaretakerDocument,
} from './schemas/pet-caretaker.schema';
import { AddCaretakerDto } from './dto/add-caretaker.dto';
import { PetsService } from '../pets/pets.service';
import { UsersService } from '../users/users.service';
import { ActivityService } from '../activity/activity.service';
import { DOMAIN_EVENTS } from '../../common/events/domain-events';
import { isDuplicateKeyError } from '../../common/utils/mongo.util';

@Injectable()
export class CaretakersService {
  constructor(
    @InjectModel(PetCaretaker.name)
    private readonly caretakerModel: Model<PetCaretakerDocument>,

    private readonly petsService: PetsService,
    private readonly usersService: UsersService,
    private readonly activityService: ActivityService,
  ) {}

  // Owner-only — granting access is deliberately not something a caretaker
  // can do for another caretaker (no delegation chain, keeps "who has
  // access to my pet" a single, always-accurate list the owner controls).
  async add(ownerId: string, petId: string, dto: AddCaretakerDto) {
    await this.petsService.findOwnedPet(ownerId, petId);

    const targetUser = await this.usersService.findByEmailForLookup(dto.email);

    if (!targetUser) {
      throw new NotFoundException(
        'No account exists with that email — the caretaker must already have a Pawtato account',
      );
    }

    if (targetUser._id.toString() === ownerId) {
      throw new BadRequestException('You cannot add yourself as a caretaker');
    }

    try {
      const caretaker = await this.caretakerModel.create({
        petId: new Types.ObjectId(petId),
        userId: targetUser._id,
        addedBy: new Types.ObjectId(ownerId),
      });

      await this.activityService.log(ownerId, 'pet.caretaker.added', petId, {
        caretakerUserId: targetUser._id.toString(),
        caretakerEmail: targetUser.email,
      });

      return caretaker.populate('userId', 'fullName email');
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new BadRequestException(
          'This user is already a caretaker for this pet',
        );
      }

      throw error;
    }
  }

  // Owner or an existing caretaker may see who else has access — matches
  // the transparency principle already established elsewhere in this
  // codebase (e.g. dating's "Viewed just now — this view is logged" copy):
  // shared access shouldn't be invisible to the people sharing it.
  async list(userId: string, petId: string) {
    await this.petsService.findAccessiblePet(userId, petId);

    return this.caretakerModel
      .find({ petId: new Types.ObjectId(petId) })
      .populate('userId', 'fullName email')
      .populate('addedBy', 'fullName email')
      .sort({ createdAt: -1 });
  }

  // Owner-only removal of a specific caretaker.
  async remove(ownerId: string, petId: string, caretakerId: string) {
    await this.petsService.findOwnedPet(ownerId, petId);

    const result = await this.caretakerModel.findOneAndDelete({
      _id: caretakerId,
      petId: new Types.ObjectId(petId),
    });

    if (!result) {
      throw new NotFoundException('Caretaker not found for this pet');
    }

    await this.activityService.log(ownerId, 'pet.caretaker.removed', petId, {
      caretakerUserId: result.userId.toString(),
    });

    return { message: 'Caretaker removed' };
  }

  // A caretaker voluntarily revoking their own access — no pet-ownership
  // check needed here at all (unlike remove() above), since this only ever
  // touches the caller's own caretaker row.
  async leave(userId: string, petId: string) {
    const result = await this.caretakerModel.findOneAndDelete({
      petId: new Types.ObjectId(petId),
      userId: new Types.ObjectId(userId),
    });

    if (!result) {
      throw new NotFoundException('You are not a caretaker for this pet');
    }

    await this.activityService.log(userId, 'pet.caretaker.left', petId);

    return { message: 'You are no longer a caretaker for this pet' };
  }

  // Every pet the caller has been granted caretaker access to (not pets
  // they own) — without this, a caretaker has no way to even discover
  // which pets they can act on, since GET /pets only ever lists the
  // caller's own pets.
  async listPetsForCaretaker(userId: string) {
    return this.caretakerModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate({
        path: 'petId',
        select: 'name species breed profileImage owner',
        populate: { path: 'owner', select: 'fullName email' },
      })
      .sort({ createdAt: -1 });
  }

  // Cascade delete — every caretaker row referencing any of these pets.
  // Called both from AdminService (admin-initiated pet/user deletion, see
  // below) and automatically whenever a pet is self-deleted by its owner
  // (PetsService.remove() emits PET_DELETED — see @OnEvent below), the same
  // decoupled pattern DatingService already uses for the same event.
  async deleteAllForPets(petIds: string[]) {
    if (petIds.length === 0) {
      return { deletedCount: 0 };
    }

    const result = await this.caretakerModel.deleteMany({
      petId: { $in: petIds.map((id) => new Types.ObjectId(id)) },
    });

    return { deletedCount: result.deletedCount };
  }

  // Cascade delete for the *other* direction — a deleted user's access on
  // pets they don't own (i.e. rows where they're the caretaker, not the
  // owner) must also be cleaned up. The owner-side rows for their own pets
  // are already covered by deleteAllForPets(petIds) in AdminService.delete().
  async deleteAllForCaretakerUser(userId: string) {
    const result = await this.caretakerModel.deleteMany({
      userId: new Types.ObjectId(userId),
    });

    return { deletedCount: result.deletedCount };
  }

  @OnEvent(DOMAIN_EVENTS.PET_DELETED)
  async handlePetDeleted(payload: { petId: string; ownerId: string }) {
    await this.deleteAllForPets([payload.petId]);
  }
}
