import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Pet, PetDocument } from '../pets/schemas/pet.schema';
import { Tag, TagDocument } from '../tags/schemas/tag.schema';
import { TagStatus } from '../../common/enums/tag-status.enum';
import { ScansService } from '../scans/scans.service';
import { FoundReportsService } from '../found-reports/found-reports.service';
import { CreateFoundReportDto } from '../found-reports/dto/create-found-report.dto';
import { NearbyLostPetsQueryDto } from './dto/nearby-lost-pets-query.dto';

@Injectable()
export class PublicService {
  constructor(
    @InjectModel(Pet.name)
    private readonly petModel: Model<PetDocument>,

    @InjectModel(Tag.name)
    private readonly tagModel: Model<TagDocument>,

    private readonly scansService: ScansService,
    private readonly foundReportsService: FoundReportsService,
  ) {}

  async getPetProfile(publicCode: string, userAgent?: string) {
    const tag = await this.tagModel.findOne({ publicCode });

    // A code that was never issued and a code that exists but isn't linked
    // to a pet resolve to the same "not linked" response — a stranger
    // scanning a sticker can't tell the two apart anyway, and collapsing
    // them avoids leaking which codes are real via a 404-vs-200 difference.
    if (!tag) {
      return {
        tagStatus: TagStatus.AVAILABLE,
        message: 'This QR is not linked to a pet.',
      };
    }

    if (tag.status === TagStatus.RETIRED) {
      await this.scansService.record(tag._id, null, tag.publicCode, userAgent);

      return {
        tagStatus: TagStatus.RETIRED,
        message: 'This tag has been retired and is no longer in use.',
      };
    }

    if (tag.status === TagStatus.SUSPENDED) {
      await this.scansService.record(tag._id, null, tag.publicCode, userAgent);

      return {
        tagStatus: TagStatus.SUSPENDED,
        message: 'This tag has been suspended.',
      };
    }

    if (tag.status !== TagStatus.ASSIGNED || !tag.assignedPetId) {
      await this.scansService.record(tag._id, null, tag.publicCode, userAgent);

      return {
        tagStatus: tag.status,
        message: 'This QR is not linked to a pet.',
      };
    }

    const pet = await this.petModel.findByIdAndUpdate(
      tag.assignedPetId,
      {
        $inc: { scanCount: 1 },
        lastScannedAt: new Date(),
      },
      { new: true },
    );

    if (!pet) {
      throw new NotFoundException('Pet not found');
    }

    await this.scansService.record(
      tag._id,
      tag.assignedPetId,
      tag.publicCode,
      userAgent,
    );

    return {
      tagStatus: TagStatus.ASSIGNED,
      // Explicit, finder-facing label alongside the raw boolean — "is this
      // pet missing or safe" shouldn't require the frontend to interpret a
      // boolean itself.
      petStatus: pet.isLost ? 'MISSING' : 'SAFE',
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      gender: pet.gender,
      color: pet.color,
      birthDate: pet.birthDate,
      weight: pet.weight,
      notableTrait: pet.notableTrait,
      isLost: pet.isLost,
      profileImage: pet.profileImage,
      lastSeenLocation: pet.lastSeenLocation,
      lostDate: pet.lostDate,
      lostDescription: pet.lostDescription,
      reward: pet.reward,
      emergencyContact: pet.emergencyContact,
    };
  }

  async getLostPets() {
    const pets = await this.petModel
      .find({ isLost: true })
      .select(
        'name species breed profileImage lastSeenLocation reward lostDate',
      )
      .sort({ lostDate: -1 })
      .lean();

    const petIds = pets.map((pet) => pet._id);

    const tags = await this.tagModel
      .find({
        assignedPetId: { $in: petIds },
        status: TagStatus.ASSIGNED,
      })
      .select('assignedPetId publicCode')
      .lean();

    const publicCodeByPetId = new Map(
      tags.map((tag) => [String(tag.assignedPetId), tag.publicCode]),
    );

    return pets.map((pet) => ({
      publicCode: publicCodeByPetId.get(String(pet._id)) ?? null,
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      profileImage: pet.profileImage,
      lastSeenLocation: pet.lastSeenLocation,
      reward: pet.reward,
      lostDate: pet.lostDate,
    }));
  }

  // Same public-safe field set as getLostPets(), plus a computed distance —
  // uses $geoNear (an aggregation-only stage) rather than .find()'s $near
  // because $geoNear is the only geospatial operator that returns the
  // computed distance alongside each document.
  async getNearbyLostPets(query: NearbyLostPetsQueryDto) {
    const { lat, lng, radiusKm } = query;

    const pets = await this.petModel.aggregate<{
      _id: Types.ObjectId;
      name: string;
      species: string;
      breed: string;
      profileImage: string;
      lastSeenLocation?: string;
      reward?: number;
      lostDate?: Date;
      distanceKm: number;
    }>([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lng, lat] },
          distanceField: 'distanceKm',
          distanceMultiplier: 1 / 1000, // meters -> km
          maxDistance: radiusKm * 1000,
          query: { isLost: true },
          spherical: true,
        },
      },
      {
        $project: {
          name: 1,
          species: 1,
          breed: 1,
          profileImage: 1,
          lastSeenLocation: 1,
          reward: 1,
          lostDate: 1,
          distanceKm: 1,
        },
      },
    ]);

    const petIds = pets.map((pet) => pet._id);

    const tags = await this.tagModel
      .find({
        assignedPetId: { $in: petIds },
        status: TagStatus.ASSIGNED,
      })
      .select('assignedPetId publicCode')
      .lean();

    const publicCodeByPetId = new Map(
      tags.map((tag) => [String(tag.assignedPetId), tag.publicCode]),
    );

    return pets.map((pet) => ({
      publicCode: publicCodeByPetId.get(String(pet._id)) ?? null,
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      profileImage: pet.profileImage,
      lastSeenLocation: pet.lastSeenLocation,
      reward: pet.reward,
      lostDate: pet.lostDate,
      distanceKm: Math.round(pet.distanceKm * 10) / 10,
    }));
  }

  async submitFoundReport(
    publicCode: string,
    dto: CreateFoundReportDto,
    photoUrl?: string,
  ) {
    // Deliberately don't return the raw FoundReport doc — it carries the pet's
    // and tag's internal Mongo IDs, which the public API must never expose.
    await this.foundReportsService.create(publicCode, dto, photoUrl);

    return {
      message: 'Thanks — the owner has been notified.',
    };
  }
}
