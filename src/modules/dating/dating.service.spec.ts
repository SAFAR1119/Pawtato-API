import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';

import { DatingService } from './dating.service';
import { PetDatingProfile } from './schemas/pet-dating-profile.schema';
import { Swipe } from './schemas/swipe.schema';
import { Match } from './schemas/match.schema';
import { Message } from './schemas/message.schema';
import { DatingReport } from './schemas/dating-report.schema';
import { PetsService } from '../pets/pets.service';
import { MedicalService } from '../medical/medical.service';
import { VaccinationsService } from '../vaccinations/vaccinations.service';
import { ActivityService } from '../activity/activity.service';
import { IdentityVerificationService } from './identity-verification.service';
import { DatingChatNotificationService } from './dating-chat-notification.service';
import { DatingMode } from '../../common/enums/dating-mode.enum';
import { SwipeAction } from '../../common/enums/swipe-action.enum';
import { MatchStatus } from '../../common/enums/match-status.enum';
import { DatingReportStatus } from '../../common/enums/dating-report-status.enum';
import { PetGender } from '../../common/enums/pet-gender.enum';
import { DOMAIN_EVENTS } from '../../common/events/domain-events';

describe('DatingService', () => {
  let service: DatingService;
  let profileModel: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    countDocuments: jest.Mock;
    distinct: jest.Mock;
    deleteMany: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
  let swipeModel: {
    create: jest.Mock;
    findOne: jest.Mock;
    distinct: jest.Mock;
    deleteMany: jest.Mock;
  };
  let matchModel: {
    create: jest.Mock;
    findOne: jest.Mock;
    findById: jest.Mock;
    find: jest.Mock;
    deleteMany: jest.Mock;
  };
  let messageModel: {
    create: jest.Mock;
    find: jest.Mock;
    deleteMany: jest.Mock;
  };
  let datingReportModel: {
    create: jest.Mock;
    find: jest.Mock;
    findById: jest.Mock;
    countDocuments: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    deleteMany: jest.Mock;
  };
  let petsService: {
    findOwnedPet: jest.Mock;
    findByIdAdmin: jest.Mock;
    findIdsForOwner: jest.Mock;
    findIdsBySpecies: jest.Mock;
    findIdsBySpeciesAndGender: jest.Mock;
    findOwnersForPets: jest.Mock;
  };
  let medicalService: { findAll: jest.Mock; findAllByPet: jest.Mock };
  let vaccinationsService: { findAll: jest.Mock; findAllByPet: jest.Mock };
  let activityService: { log: jest.Mock };
  let identityVerificationService: {
    isApproved: jest.Mock;
    getApprovedUserIds: jest.Mock;
    getSignedNidUrls: jest.Mock;
  };
  let datingChatNotificationService: {
    createForMessage: jest.Mock;
    markConversationRead: jest.Mock;
    deleteAllForPets: jest.Mock;
    deleteAllForMatches: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };
  let configService: { get: jest.Mock };

  const ownerId = new Types.ObjectId().toString();
  const otherOwnerId = new Types.ObjectId().toString();
  const petId = new Types.ObjectId();
  const otherPetId = new Types.ObjectId();
  const photos = ['https://your-app.example/uploads/pets/photo1.png'];

  function makePet(overrides: Record<string, unknown> = {}) {
    return {
      _id: petId,
      species: 'Cat',
      gender: PetGender.MALE,
      owner: ownerId,
      ...overrides,
    };
  }

  beforeEach(async () => {
    profileModel = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      countDocuments: jest.fn(),
      distinct: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      findOneAndUpdate: jest.fn(),
    };
    swipeModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      distinct: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    matchModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    messageModel = {
      create: jest.fn(),
      find: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    datingReportModel = {
      create: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      countDocuments: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    petsService = {
      findOwnedPet: jest.fn().mockResolvedValue(makePet()),
      findByIdAdmin: jest.fn(),
      findIdsForOwner: jest.fn().mockResolvedValue([]),
      findIdsBySpecies: jest.fn().mockResolvedValue([]),
      findIdsBySpeciesAndGender: jest.fn().mockResolvedValue([]),
      findOwnersForPets: jest.fn().mockResolvedValue(new Map()),
    };
    medicalService = {
      findAll: jest.fn().mockResolvedValue([]),
      findAllByPet: jest.fn().mockResolvedValue([]),
    };
    vaccinationsService = {
      findAll: jest.fn().mockResolvedValue([]),
      findAllByPet: jest.fn().mockResolvedValue([]),
    };
    activityService = { log: jest.fn().mockResolvedValue(undefined) };
    identityVerificationService = {
      isApproved: jest.fn().mockResolvedValue(false),
      getApprovedUserIds: jest.fn().mockResolvedValue(new Set()),
      getSignedNidUrls: jest
        .fn()
        .mockResolvedValue({ frontUrl: 'front-url', backUrl: 'back-url' }),
    };
    datingChatNotificationService = {
      createForMessage: jest.fn().mockResolvedValue(undefined),
      markConversationRead: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      deleteAllForPets: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      deleteAllForMatches: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    eventEmitter = { emit: jest.fn() };
    configService = { get: jest.fn().mockReturnValue(3) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatingService,
        {
          provide: getModelToken(PetDatingProfile.name),
          useValue: profileModel,
        },
        { provide: getModelToken(Swipe.name), useValue: swipeModel },
        { provide: getModelToken(Match.name), useValue: matchModel },
        { provide: getModelToken(Message.name), useValue: messageModel },
        {
          provide: getModelToken(DatingReport.name),
          useValue: datingReportModel,
        },
        { provide: PetsService, useValue: petsService },
        { provide: MedicalService, useValue: medicalService },
        { provide: VaccinationsService, useValue: vaccinationsService },
        { provide: ActivityService, useValue: activityService },
        {
          provide: IdentityVerificationService,
          useValue: identityVerificationService,
        },
        {
          provide: DatingChatNotificationService,
          useValue: datingChatNotificationService,
        },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<DatingService>(DatingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createProfile', () => {
    it('creates a profile for a cat/dog pet with no existing profile', async () => {
      profileModel.findOne.mockResolvedValue(null);
      profileModel.create.mockResolvedValue({
        modes: [DatingMode.PLAYDATE],
      });

      await service.createProfile(ownerId, petId.toString(), {
        modes: [DatingMode.PLAYDATE],
        photos,
      });

      expect(profileModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ petId, modes: [DatingMode.PLAYDATE] }),
      );
    });

    it('rejects a species other than cat/dog', async () => {
      petsService.findOwnedPet.mockResolvedValue(
        makePet({ species: 'Parrot' }),
      );

      await expect(
        service.createProfile(ownerId, petId.toString(), {
          modes: [DatingMode.PLAYDATE],
          photos,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(profileModel.create).not.toHaveBeenCalled();
    });

    it('rejects creating a second profile for the same pet', async () => {
      profileModel.findOne.mockResolvedValue({ _id: new Types.ObjectId() });

      await expect(
        service.createProfile(ownerId, petId.toString(), {
          modes: [DatingMode.PLAYDATE],
          photos,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(profileModel.create).not.toHaveBeenCalled();
    });
  });

  describe('updateProfile', () => {
    it('throws NotFoundException when no profile exists', async () => {
      profileModel.findOne.mockResolvedValue(null);

      await expect(
        service.updateProfile(ownerId, petId.toString(), { bio: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('applies only the provided fields and saves', async () => {
      const profile = {
        modes: [DatingMode.PLAYDATE],
        bio: 'old',
        save: jest.fn().mockResolvedValue(undefined),
      };
      profileModel.findOne.mockResolvedValue(profile);

      await service.updateProfile(ownerId, petId.toString(), {
        bio: 'new bio',
      });

      expect(profile.bio).toBe('new bio');
      expect(profile.save).toHaveBeenCalled();
    });

    it('rejects clearing every mode', async () => {
      const profile = {
        modes: [DatingMode.PLAYDATE],
        save: jest.fn().mockResolvedValue(undefined),
      };
      profileModel.findOne.mockResolvedValue(profile);

      await expect(
        service.updateProfile(ownerId, petId.toString(), { modes: [] }),
      ).rejects.toThrow(BadRequestException);
      expect(profile.save).not.toHaveBeenCalled();
    });
  });

  describe('verifyHealth', () => {
    it('rejects a profile without BREEDING enabled', async () => {
      profileModel.findOne.mockResolvedValue({
        modes: [DatingMode.PLAYDATE],
      });

      await expect(
        service.verifyHealth(ownerId, petId.toString()),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when medical/vaccination records are missing', async () => {
      profileModel.findOne.mockResolvedValue({
        modes: [DatingMode.BREEDING],
      });
      medicalService.findAll.mockResolvedValue([]);
      vaccinationsService.findAll.mockResolvedValue([{ _id: '1' }]);

      await expect(
        service.verifyHealth(ownerId, petId.toString()),
      ).rejects.toThrow(BadRequestException);
    });

    it('sets healthVerified true once both records exist', async () => {
      const profile = {
        modes: [DatingMode.PLAYDATE, DatingMode.BREEDING],
        healthVerified: false,
        save: jest.fn().mockResolvedValue(undefined),
      };
      profileModel.findOne.mockResolvedValue(profile);
      medicalService.findAll.mockResolvedValue([{ _id: '1' }]);
      vaccinationsService.findAll.mockResolvedValue([{ _id: '2' }]);

      await service.verifyHealth(ownerId, petId.toString());

      expect(profile.healthVerified).toBe(true);
      expect(profile.save).toHaveBeenCalled();
    });
  });

  describe('getProfile', () => {
    function makeProfileDoc(overrides: Record<string, unknown> = {}) {
      return {
        isActive: true,
        shareHealthSummary: false,
        petId: { _id: petId, name: 'Rex' },
        toObject: jest.fn().mockReturnValue({
          isActive: true,
          shareHealthSummary: false,
          petId: { _id: petId, name: 'Rex' },
        }),
        ...overrides,
      };
    }

    it('throws NotFoundException when no profile exists', async () => {
      profileModel.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.getProfile(ownerId, petId.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for an inactive profile viewed by a non-owner', async () => {
      profileModel.findOne.mockReturnValue({
        populate: jest
          .fn()
          .mockResolvedValue(makeProfileDoc({ isActive: false })),
      });
      petsService.findOwnersForPets.mockResolvedValue(
        new Map([[petId.toString(), otherOwnerId]]),
      );

      await expect(
        service.getProfile(ownerId, petId.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('includes medicalSummary only when shareHealthSummary is true', async () => {
      profileModel.findOne.mockReturnValue({
        populate: jest
          .fn()
          .mockResolvedValue(makeProfileDoc({ shareHealthSummary: true })),
      });
      petsService.findOwnersForPets.mockResolvedValue(
        new Map([[petId.toString(), ownerId]]),
      );
      vaccinationsService.findAllByPet.mockResolvedValue([
        {
          nextDueDate: new Date(Date.now() + 86_400_000),
          administeredDate: new Date(),
        },
      ]);
      medicalService.findAllByPet.mockResolvedValue([{ _id: '1' }]);

      const result = await service.getProfile(ownerId, petId.toString());

      expect(result).toHaveProperty('medicalSummary');
      expect(
        (result as { medicalSummary: { vaccinationsUpToDate: boolean } })
          .medicalSummary.vaccinationsUpToDate,
      ).toBe(true);
    });

    it('omits medicalSummary when shareHealthSummary is false', async () => {
      profileModel.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue(makeProfileDoc()),
      });
      petsService.findOwnersForPets.mockResolvedValue(
        new Map([[petId.toString(), ownerId]]),
      );

      const result = await service.getProfile(ownerId, petId.toString());

      expect(result).not.toHaveProperty('medicalSummary');
    });
  });

  describe('discover', () => {
    function stubProfileFind(items: unknown[]) {
      profileModel.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue(items),
            }),
          }),
        }),
      });
    }

    it('throws BadRequestException when the swiping pet has no profile', async () => {
      profileModel.findOne.mockResolvedValue(null);

      await expect(
        service.discover(ownerId, {
          petId: petId.toString(),
          mode: DatingMode.PLAYDATE,
          page: 1,
          limit: 10,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the profile is inactive', async () => {
      profileModel.findOne.mockResolvedValue({
        isActive: false,
        modes: [DatingMode.PLAYDATE],
      });

      await expect(
        service.discover(ownerId, {
          petId: petId.toString(),
          mode: DatingMode.PLAYDATE,
          page: 1,
          limit: 10,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when the swiping pet hasn't enabled the requested mode", async () => {
      profileModel.findOne.mockResolvedValue({
        isActive: true,
        modes: [DatingMode.PLAYDATE],
      });

      await expect(
        service.discover(ownerId, {
          petId: petId.toString(),
          mode: DatingMode.BREEDING,
          page: 1,
          limit: 10,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when verifiedOnly is requested by an unverified caller', async () => {
      profileModel.findOne.mockResolvedValue({
        isActive: true,
        modes: [DatingMode.PLAYDATE],
      });
      identityVerificationService.isApproved.mockResolvedValue(false);

      await expect(
        service.discover(ownerId, {
          petId: petId.toString(),
          mode: DatingMode.PLAYDATE,
          verifiedOnly: true,
          page: 1,
          limit: 10,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('BREEDING mode restricts candidates to the same species and opposite gender, excluding own/swiped pets', async () => {
      profileModel.findOne.mockResolvedValue({
        isActive: true,
        modes: [DatingMode.BREEDING],
      });
      petsService.findOwnedPet.mockResolvedValue(
        makePet({ species: 'Cat', gender: PetGender.MALE }),
      );
      petsService.findIdsForOwner.mockResolvedValue([petId.toString()]);
      swipeModel.distinct.mockResolvedValue([otherPetId]);
      const eligibleId = new Types.ObjectId().toString();
      petsService.findIdsBySpeciesAndGender.mockResolvedValue([
        petId.toString(),
        otherPetId.toString(),
        eligibleId,
      ]);

      let capturedFilter: { petId: { $in: Types.ObjectId[] } } | undefined;
      profileModel.distinct.mockImplementation(
        (_field: string, filter: { petId: { $in: Types.ObjectId[] } }) => {
          capturedFilter = filter;
          return Promise.resolve(filter.petId.$in);
        },
      );
      profileModel.countDocuments.mockResolvedValue(0);
      stubProfileFind([]);

      await service.discover(ownerId, {
        petId: petId.toString(),
        mode: DatingMode.BREEDING,
        page: 1,
        limit: 10,
      });

      const candidateIds = capturedFilter!.petId.$in.map((id) => id.toString());

      expect(candidateIds).toEqual([eligibleId]);
      expect(petsService.findIdsBySpeciesAndGender).toHaveBeenCalledWith(
        'Cat',
        PetGender.FEMALE,
      );
    });

    it('PLAYDATE mode never restricts by species', async () => {
      profileModel.findOne.mockResolvedValue({
        isActive: true,
        modes: [DatingMode.PLAYDATE],
      });

      profileModel.distinct.mockResolvedValue([]);
      profileModel.countDocuments.mockResolvedValue(0);
      stubProfileFind([]);

      await service.discover(ownerId, {
        petId: petId.toString(),
        mode: DatingMode.PLAYDATE,
        page: 1,
        limit: 10,
      });

      expect(petsService.findIdsBySpecies).not.toHaveBeenCalled();
    });

    it('excludes only swipes still inside the reset window, not every swipe ever made', async () => {
      profileModel.findOne.mockResolvedValue({
        isActive: true,
        modes: [DatingMode.PLAYDATE],
      });
      profileModel.distinct.mockResolvedValue([]);
      profileModel.countDocuments.mockResolvedValue(0);
      stubProfileFind([]);

      await service.discover(ownerId, {
        petId: petId.toString(),
        mode: DatingMode.PLAYDATE,
        page: 1,
        limit: 10,
      });

      const [, distinctFilter] = swipeModel.distinct.mock.calls[0] as [
        string,
        {
          fromPetId: Types.ObjectId;
          mode: DatingMode;
          updatedAt: { $gte: Date };
        },
      ];

      expect(distinctFilter).toMatchObject({
        fromPetId: petId,
        mode: DatingMode.PLAYDATE,
      });
      expect(distinctFilter.updatedAt.$gte).toBeInstanceOf(Date);
    });

    it('excludes an actively matched pet from the pool regardless of swipe age', async () => {
      profileModel.findOne.mockResolvedValue({
        isActive: true,
        modes: [DatingMode.PLAYDATE],
      });
      profileModel.distinct.mockResolvedValue([]);
      profileModel.countDocuments.mockResolvedValue(0);
      swipeModel.distinct.mockResolvedValue([]);
      stubProfileFind([]);

      const matchedPetId = new Types.ObjectId();
      matchModel.find.mockResolvedValue([
        {
          petAId: petId,
          petBId: matchedPetId,
          status: MatchStatus.ACTIVE,
        },
      ]);

      let capturedFilter: { petId: { $nin: Types.ObjectId[] } } | undefined;
      profileModel.distinct.mockImplementation(
        (_field: string, filter: { petId: { $nin: Types.ObjectId[] } }) => {
          capturedFilter = filter;
          return Promise.resolve([]);
        },
      );

      await service.discover(ownerId, {
        petId: petId.toString(),
        mode: DatingMode.PLAYDATE,
        page: 1,
        limit: 10,
      });

      expect(matchModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: MatchStatus.ACTIVE }),
        expect.anything(),
      );

      const excludedIds = capturedFilter!.petId.$nin.map((id) => id.toString());
      expect(excludedIds).toContain(matchedPetId.toString());
    });
  });

  describe('swipe', () => {
    const fromPetId = petId.toString();
    const toPetId = otherPetId.toString();

    beforeEach(() => {
      petsService.findOwnedPet.mockResolvedValue(
        makePet({ _id: petId, species: 'Cat' }),
      );
      petsService.findByIdAdmin.mockResolvedValue(
        makePet({ _id: otherPetId, species: 'Cat', owner: otherOwnerId }),
      );
      profileModel.findOne.mockResolvedValue({
        isActive: true,
        modes: [DatingMode.PLAYDATE, DatingMode.BREEDING],
      });
      swipeModel.create.mockResolvedValue({ _id: new Types.ObjectId() });
    });

    it('rejects a pet swiping itself', async () => {
      await expect(
        service.swipe(ownerId, {
          fromPetId,
          toPetId: fromPetId,
          action: SwipeAction.LIKE,
          mode: DatingMode.PLAYDATE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects two pets owned by the same person, regardless of mode', async () => {
      petsService.findByIdAdmin.mockResolvedValue(
        makePet({ _id: otherPetId, species: 'Cat', owner: ownerId }),
      );

      await expect(
        service.swipe(ownerId, {
          fromPetId,
          toPetId,
          action: SwipeAction.LIKE,
          mode: DatingMode.PLAYDATE,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(swipeModel.create).not.toHaveBeenCalled();
    });

    it('rejects same-gender pets in BREEDING mode', async () => {
      petsService.findOwnedPet.mockResolvedValue(
        makePet({ _id: petId, species: 'Cat', gender: PetGender.MALE }),
      );
      petsService.findByIdAdmin.mockResolvedValue(
        makePet({
          _id: otherPetId,
          species: 'Cat',
          gender: PetGender.MALE,
          owner: otherOwnerId,
        }),
      );

      await expect(
        service.swipe(ownerId, {
          fromPetId,
          toPetId,
          action: SwipeAction.LIKE,
          mode: DatingMode.BREEDING,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(swipeModel.create).not.toHaveBeenCalled();
    });

    it('allows opposite-gender, same-species pets in BREEDING mode', async () => {
      petsService.findOwnedPet.mockResolvedValue(
        makePet({ _id: petId, species: 'Cat', gender: PetGender.MALE }),
      );
      petsService.findByIdAdmin.mockResolvedValue(
        makePet({
          _id: otherPetId,
          species: 'Cat',
          gender: PetGender.FEMALE,
          owner: otherOwnerId,
        }),
      );
      swipeModel.findOne.mockResolvedValue(null);

      const result = await service.swipe(ownerId, {
        fromPetId,
        toPetId,
        action: SwipeAction.LIKE,
        mode: DatingMode.BREEDING,
      });

      expect(swipeModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ mode: DatingMode.BREEDING }),
      );
      expect(result.match).toBeNull();
    });

    it('rejects mismatched species in BREEDING mode', async () => {
      petsService.findByIdAdmin.mockResolvedValue(
        makePet({ _id: otherPetId, species: 'Dog', owner: otherOwnerId }),
      );

      await expect(
        service.swipe(ownerId, {
          fromPetId,
          toPetId,
          action: SwipeAction.LIKE,
          mode: DatingMode.BREEDING,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(swipeModel.create).not.toHaveBeenCalled();
    });

    it('allows mismatched species in PLAYDATE mode', async () => {
      petsService.findByIdAdmin.mockResolvedValue(
        makePet({ _id: otherPetId, species: 'Dog', owner: otherOwnerId }),
      );
      swipeModel.findOne.mockResolvedValue(null);

      const result = await service.swipe(ownerId, {
        fromPetId,
        toPetId,
        action: SwipeAction.LIKE,
        mode: DatingMode.PLAYDATE,
      });

      expect(swipeModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ mode: DatingMode.PLAYDATE }),
      );
      expect(result.match).toBeNull();
    });

    it('rejects when the target profile has not enabled the requested mode', async () => {
      profileModel.findOne
        .mockResolvedValueOnce({
          isActive: true,
          modes: [DatingMode.PLAYDATE, DatingMode.BREEDING],
        })
        .mockResolvedValueOnce({
          isActive: true,
          modes: [DatingMode.PLAYDATE],
        });

      await expect(
        service.swipe(ownerId, {
          fromPetId,
          toPetId,
          action: SwipeAction.LIKE,
          mode: DatingMode.BREEDING,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(swipeModel.create).not.toHaveBeenCalled();
    });

    it('rejects an inactive target profile', async () => {
      profileModel.findOne
        .mockResolvedValueOnce({
          isActive: true,
          modes: [DatingMode.PLAYDATE],
        })
        .mockResolvedValueOnce({
          isActive: false,
          modes: [DatingMode.PLAYDATE],
        });

      await expect(
        service.swipe(ownerId, {
          fromPetId,
          toPetId,
          action: SwipeAction.LIKE,
          mode: DatingMode.PLAYDATE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a duplicate swipe via the unique-index error', async () => {
      swipeModel.create.mockRejectedValue({ code: 11000 });

      await expect(
        service.swipe(ownerId, {
          fromPetId,
          toPetId,
          action: SwipeAction.LIKE,
          mode: DatingMode.PLAYDATE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('PASS never creates a match', async () => {
      const result = await service.swipe(ownerId, {
        fromPetId,
        toPetId,
        action: SwipeAction.PASS,
        mode: DatingMode.PLAYDATE,
      });

      expect(result.match).toBeNull();
      expect(matchModel.create).not.toHaveBeenCalled();
    });

    it('LIKE without a reciprocal like returns match: null', async () => {
      swipeModel.findOne.mockResolvedValue(null);

      const result = await service.swipe(ownerId, {
        fromPetId,
        toPetId,
        action: SwipeAction.LIKE,
        mode: DatingMode.PLAYDATE,
      });

      expect(result.match).toBeNull();
      expect(matchModel.create).not.toHaveBeenCalled();
    });

    it('a mutual LIKE in the same mode creates a Match in canonical pet-id order', async () => {
      swipeModel.findOne
        .mockResolvedValueOnce(null) // no existing swipe from fromPet -> toPet
        .mockResolvedValueOnce({ _id: new Types.ObjectId() }); // reciprocal LIKE

      const [expectedA, expectedB] =
        petId.toString() < otherPetId.toString()
          ? [petId, otherPetId]
          : [otherPetId, petId];
      const createdMatch = {
        _id: new Types.ObjectId(),
        petAId: expectedA,
        petBId: expectedB,
      };
      matchModel.create.mockResolvedValue(createdMatch);

      const result = await service.swipe(ownerId, {
        fromPetId,
        toPetId,
        action: SwipeAction.LIKE,
        mode: DatingMode.PLAYDATE,
      });

      expect(matchModel.create).toHaveBeenCalledWith({
        petAId: expectedA,
        petBId: expectedB,
      });
      expect(swipeModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ mode: DatingMode.PLAYDATE }),
      );
      expect(result.match).toBe(createdMatch);
    });

    it('a race on match creation returns the already-created match instead of erroring', async () => {
      swipeModel.findOne
        .mockResolvedValueOnce(null) // no existing swipe from fromPet -> toPet
        .mockResolvedValueOnce({ _id: new Types.ObjectId() }); // reciprocal LIKE
      matchModel.create.mockRejectedValue({ code: 11000 });

      const [expectedA, expectedB] =
        petId.toString() < otherPetId.toString()
          ? [petId, otherPetId]
          : [otherPetId, petId];
      const existingMatch = {
        _id: new Types.ObjectId(),
        petAId: expectedA,
        petBId: expectedB,
      };
      matchModel.findOne.mockResolvedValue(existingMatch);

      const result = await service.swipe(ownerId, {
        fromPetId,
        toPetId,
        action: SwipeAction.LIKE,
        mode: DatingMode.PLAYDATE,
      });

      expect(result.match).toBe(existingMatch);
    });

    it('rejects a re-swipe while the previous swipe is still inside the reset window', async () => {
      const recentSwipe = {
        action: SwipeAction.PASS,
        updatedAt: new Date(),
        save: jest.fn(),
      };
      swipeModel.findOne.mockResolvedValueOnce(recentSwipe);

      await expect(
        service.swipe(ownerId, {
          fromPetId,
          toPetId,
          action: SwipeAction.LIKE,
          mode: DatingMode.PLAYDATE,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(recentSwipe.save).not.toHaveBeenCalled();
      expect(swipeModel.create).not.toHaveBeenCalled();
    });

    it('upserts an expired swipe in place instead of rejecting, letting a reappeared pet be swiped on again', async () => {
      const expiredSwipe = {
        action: SwipeAction.PASS,
        updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        save: jest.fn().mockResolvedValue(undefined),
      };
      swipeModel.findOne
        .mockResolvedValueOnce(expiredSwipe) // existing-swipe check
        .mockResolvedValueOnce(null); // reciprocal check

      const result = await service.swipe(ownerId, {
        fromPetId,
        toPetId,
        action: SwipeAction.LIKE,
        mode: DatingMode.PLAYDATE,
      });

      expect(expiredSwipe.action).toBe(SwipeAction.LIKE);
      expect(expiredSwipe.save).toHaveBeenCalled();
      expect(swipeModel.create).not.toHaveBeenCalled();
      expect(result.match).toBeNull();
    });

    it('emits DATING_MATCH_CREATED with both pet names on a genuine new match', async () => {
      petsService.findOwnedPet.mockResolvedValue(
        makePet({ _id: petId, species: 'Cat', name: 'Rex' }),
      );
      petsService.findByIdAdmin.mockResolvedValue(
        makePet({
          _id: otherPetId,
          species: 'Cat',
          name: 'Bella',
          owner: otherOwnerId,
        }),
      );
      swipeModel.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ _id: new Types.ObjectId() });

      const [expectedA, expectedB] =
        petId.toString() < otherPetId.toString()
          ? [petId, otherPetId]
          : [otherPetId, petId];
      matchModel.create.mockResolvedValue({
        _id: new Types.ObjectId(),
        petAId: expectedA,
        petBId: expectedB,
      });

      await service.swipe(ownerId, {
        fromPetId,
        toPetId,
        action: SwipeAction.LIKE,
        mode: DatingMode.PLAYDATE,
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.DATING_MATCH_CREATED,
        expect.objectContaining({ petAName: 'Rex', petBName: 'Bella' }),
      );
    });

    it('does not re-emit DATING_MATCH_CREATED for the race loser on a duplicate/retried match request', async () => {
      swipeModel.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ _id: new Types.ObjectId() });
      matchModel.create.mockRejectedValue({ code: 11000 });
      matchModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
        petAId: petId,
        petBId: otherPetId,
      });

      await service.swipe(ownerId, {
        fromPetId,
        toPetId,
        action: SwipeAction.LIKE,
        mode: DatingMode.PLAYDATE,
      });

      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        DOMAIN_EVENTS.DATING_MATCH_CREATED,
        expect.anything(),
      );
    });
  });

  describe('match-scoped actions (messages/unmatch/nid)', () => {
    const matchId = new Types.ObjectId().toString();

    function makeMatch(overrides: Record<string, unknown> = {}) {
      return {
        _id: matchId,
        petAId: petId,
        petBId: otherPetId,
        status: MatchStatus.ACTIVE,
        nidSharedBy: [],
        save: jest.fn().mockResolvedValue(undefined),
        ...overrides,
      };
    }

    it('listMessages throws NotFoundException for an unknown match', async () => {
      matchModel.findById.mockResolvedValue(null);

      await expect(service.listMessages(ownerId, matchId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('listMessages throws NotFoundException when the caller owns neither side (IDOR-safe)', async () => {
      matchModel.findById.mockResolvedValue(makeMatch());
      petsService.findByIdAdmin
        .mockResolvedValueOnce(makePet({ _id: petId, owner: otherOwnerId }))
        .mockResolvedValueOnce(
          makePet({ _id: otherPetId, owner: otherOwnerId }),
        );

      await expect(service.listMessages(ownerId, matchId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('listMessages succeeds when the caller owns one side', async () => {
      matchModel.findById.mockResolvedValue(makeMatch());
      petsService.findByIdAdmin
        .mockResolvedValueOnce(makePet({ _id: petId, owner: ownerId }))
        .mockResolvedValueOnce(
          makePet({ _id: otherPetId, owner: otherOwnerId }),
        );
      const sort = jest.fn().mockResolvedValue([]);
      messageModel.find.mockReturnValue({ sort });

      await service.listMessages(ownerId, matchId);

      expect(messageModel.find).toHaveBeenCalledWith({ matchId });
    });

    it('sendMessage rejects once the match has ended', async () => {
      matchModel.findById.mockResolvedValue(
        makeMatch({ status: MatchStatus.UNMATCHED }),
      );
      petsService.findByIdAdmin
        .mockResolvedValueOnce(makePet({ _id: petId, owner: ownerId }))
        .mockResolvedValueOnce(
          makePet({ _id: otherPetId, owner: otherOwnerId }),
        );

      await expect(
        service.sendMessage(ownerId, matchId, { content: 'hi' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('sendMessage creates a message from the caller', async () => {
      matchModel.findById.mockResolvedValue(makeMatch());
      petsService.findByIdAdmin
        .mockResolvedValueOnce(makePet({ _id: petId, owner: ownerId }))
        .mockResolvedValueOnce(
          makePet({ _id: otherPetId, owner: otherOwnerId }),
        );
      messageModel.create.mockResolvedValue({
        _id: new Types.ObjectId(),
        content: 'hi',
        createdAt: new Date(),
      });

      await service.sendMessage(ownerId, matchId, { content: 'hi' });

      expect(messageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ matchId, content: 'hi' }),
      );
      // The emitted event carries both participating pets straight from the
      // Match document — DatingChatNotificationListener relies on this to
      // resolve sender/recipient pet without a second DB round-trip.
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'dating.message-sent',
        expect.objectContaining({
          petAId: petId.toString(),
          petBId: otherPetId.toString(),
        }),
      );
    });

    it('markChatRead delegates the delete to DatingChatNotificationService once ownership is verified', async () => {
      matchModel.findById.mockResolvedValue(makeMatch());
      petsService.findByIdAdmin
        .mockResolvedValueOnce(makePet({ _id: petId, owner: ownerId }))
        .mockResolvedValueOnce(
          makePet({ _id: otherPetId, owner: otherOwnerId }),
        );
      datingChatNotificationService.markConversationRead.mockResolvedValue({
        deletedCount: 3,
      });

      const result = await service.markChatRead(ownerId, matchId);

      expect(
        datingChatNotificationService.markConversationRead,
      ).toHaveBeenCalledWith(ownerId, matchId);
      expect(result).toEqual({
        message: 'Conversation marked as read',
        deletedCount: 3,
      });
    });

    it('markChatRead throws NotFoundException when the caller owns neither side (IDOR-safe)', async () => {
      matchModel.findById.mockResolvedValue(makeMatch());
      petsService.findByIdAdmin
        .mockResolvedValueOnce(makePet({ _id: petId, owner: otherOwnerId }))
        .mockResolvedValueOnce(
          makePet({ _id: otherPetId, owner: 'someone-else' }),
        );

      await expect(service.markChatRead(ownerId, matchId)).rejects.toThrow(
        NotFoundException,
      );
      expect(
        datingChatNotificationService.markConversationRead,
      ).not.toHaveBeenCalled();
    });

    it('unmatch flips status to UNMATCHED', async () => {
      const match = makeMatch();
      matchModel.findById.mockResolvedValue(match);
      petsService.findByIdAdmin
        .mockResolvedValueOnce(makePet({ _id: petId, owner: ownerId }))
        .mockResolvedValueOnce(
          makePet({ _id: otherPetId, owner: otherOwnerId }),
        );

      await service.unmatch(ownerId, matchId);

      expect(match.status).toBe(MatchStatus.UNMATCHED);
      expect(match.save).toHaveBeenCalled();
    });

    it('unmatch is idempotent — a second call on an already-unmatched match is a no-op', async () => {
      const match = makeMatch({ status: MatchStatus.UNMATCHED });
      matchModel.findById.mockResolvedValue(match);
      petsService.findByIdAdmin
        .mockResolvedValueOnce(makePet({ _id: petId, owner: ownerId }))
        .mockResolvedValueOnce(
          makePet({ _id: otherPetId, owner: otherOwnerId }),
        );

      const result = await service.unmatch(ownerId, matchId);

      expect(result.message).toBe('Already unmatched');
      expect(match.save).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('deleteChat rejects while the match is still active', async () => {
      matchModel.findById.mockResolvedValue(makeMatch());
      petsService.findByIdAdmin
        .mockResolvedValueOnce(makePet({ _id: petId, owner: ownerId }))
        .mockResolvedValueOnce(
          makePet({ _id: otherPetId, owner: otherOwnerId }),
        );

      await expect(service.deleteChat(ownerId, matchId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deleteChat adds the caller to deletedBy once unmatched, idempotently', async () => {
      const match = makeMatch({ status: MatchStatus.UNMATCHED, deletedBy: [] });
      matchModel.findById.mockResolvedValue(match);
      petsService.findByIdAdmin.mockImplementation((id: string) =>
        Promise.resolve(
          id === petId.toString()
            ? makePet({ _id: petId, owner: ownerId })
            : makePet({ _id: otherPetId, owner: otherOwnerId }),
        ),
      );

      await service.deleteChat(ownerId, matchId);
      await service.deleteChat(ownerId, matchId);

      expect(match.deletedBy).toHaveLength(1);
      expect(match.save).toHaveBeenCalledTimes(1);
    });

    it('shareNid rejects an unverified caller', async () => {
      matchModel.findById.mockResolvedValue(makeMatch());
      petsService.findByIdAdmin
        .mockResolvedValueOnce(makePet({ _id: petId, owner: ownerId }))
        .mockResolvedValueOnce(
          makePet({ _id: otherPetId, owner: otherOwnerId }),
        );
      identityVerificationService.isApproved.mockResolvedValue(false);

      await expect(service.shareNid(ownerId, matchId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('shareNid idempotently adds the caller to nidSharedBy once verified', async () => {
      const match = makeMatch();
      matchModel.findById.mockResolvedValue(match);
      petsService.findByIdAdmin.mockImplementation((id: string) =>
        Promise.resolve(
          id === petId.toString()
            ? makePet({ _id: petId, owner: ownerId })
            : makePet({ _id: otherPetId, owner: otherOwnerId }),
        ),
      );
      identityVerificationService.isApproved.mockResolvedValue(true);

      await service.shareNid(ownerId, matchId);
      await service.shareNid(ownerId, matchId);

      expect(match.nidSharedBy).toHaveLength(1);
      expect(match.save).toHaveBeenCalledTimes(1);
      expect(activityService.log).toHaveBeenCalledWith(
        ownerId,
        'dating.nid.shared',
        matchId,
      );
    });

    it('getNidExchange rejects an unverified caller', async () => {
      matchModel.findById.mockResolvedValue(makeMatch());
      petsService.findByIdAdmin
        .mockResolvedValueOnce(makePet({ _id: petId, owner: ownerId }))
        .mockResolvedValueOnce(
          makePet({ _id: otherPetId, owner: otherOwnerId }),
        );
      identityVerificationService.isApproved.mockResolvedValue(false);

      await expect(service.getNidExchange(ownerId, matchId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("getNidExchange rejects when the other side hasn't shared yet", async () => {
      matchModel.findById.mockResolvedValue(makeMatch({ nidSharedBy: [] }));
      petsService.findByIdAdmin.mockImplementation((id: string) =>
        Promise.resolve(
          id === petId.toString()
            ? makePet({ _id: petId, owner: ownerId })
            : makePet({ _id: otherPetId, owner: otherOwnerId }),
        ),
      );
      identityVerificationService.isApproved.mockResolvedValue(true);

      await expect(service.getNidExchange(ownerId, matchId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('getNidExchange returns signed URLs once the other side has shared', async () => {
      matchModel.findById.mockResolvedValue(
        makeMatch({ nidSharedBy: [new Types.ObjectId(otherOwnerId)] }),
      );
      petsService.findByIdAdmin.mockImplementation((id: string) =>
        Promise.resolve(
          id === petId.toString()
            ? makePet({ _id: petId, owner: ownerId })
            : makePet({ _id: otherPetId, owner: otherOwnerId }),
        ),
      );
      identityVerificationService.isApproved.mockResolvedValue(true);

      const result = await service.getNidExchange(ownerId, matchId);

      expect(result).toEqual({ frontUrl: 'front-url', backUrl: 'back-url' });
      expect(identityVerificationService.getSignedNidUrls).toHaveBeenCalledWith(
        otherOwnerId,
      );
      expect(activityService.log).toHaveBeenCalledWith(
        ownerId,
        'dating.nid.viewed',
        matchId,
        { viewedOwnerId: otherOwnerId },
      );
    });
  });

  describe('report', () => {
    it('throws NotFoundException for an unknown target pet', async () => {
      petsService.findByIdAdmin.mockResolvedValue(null);

      await expect(
        service.report(ownerId, { targetPetId: petId.toString(), reason: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the target pet has no dating profile', async () => {
      petsService.findByIdAdmin.mockResolvedValue(makePet());
      profileModel.findOne.mockResolvedValue(null);

      await expect(
        service.report(ownerId, { targetPetId: petId.toString(), reason: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a report and logs the action', async () => {
      petsService.findByIdAdmin.mockResolvedValue(makePet());
      profileModel.findOne.mockResolvedValue({ _id: new Types.ObjectId() });
      datingReportModel.create.mockResolvedValue({ _id: new Types.ObjectId() });

      await service.report(ownerId, {
        targetPetId: petId.toString(),
        reason: 'spam',
      });

      expect(datingReportModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'spam' }),
      );
      expect(activityService.log).toHaveBeenCalledWith(
        ownerId,
        'dating.report.created',
        expect.any(String),
        expect.objectContaining({ targetPetId: petId.toString() }),
      );
    });

    describe('with chat context (matchId)', () => {
      const matchId = new Types.ObjectId().toString();

      function stubMatchAndPets() {
        profileModel.findOne.mockResolvedValue({ _id: new Types.ObjectId() });
        matchModel.findById.mockResolvedValue({
          _id: matchId,
          petAId: petId,
          petBId: otherPetId,
        });
        petsService.findByIdAdmin.mockImplementation((id: string) =>
          Promise.resolve(
            id === petId.toString()
              ? makePet({ _id: petId, owner: ownerId })
              : makePet({ _id: otherPetId, owner: otherOwnerId }),
          ),
        );
        datingReportModel.create.mockResolvedValue({
          _id: new Types.ObjectId(),
        });
      }

      it('stores matchId when the target is genuinely the other side of the match', async () => {
        stubMatchAndPets();

        await service.report(ownerId, {
          targetPetId: otherPetId.toString(),
          reason: 'Harassment in chat.',
          matchId,
        });

        expect(datingReportModel.create).toHaveBeenCalledWith(
          expect.objectContaining({ matchId }),
        );
      });

      it("rejects when targetPetId is the reporter's own pet, even though it's technically in the match", async () => {
        stubMatchAndPets();

        await expect(
          service.report(ownerId, {
            targetPetId: petId.toString(),
            reason: 'Bogus context.',
            matchId,
          }),
        ).rejects.toThrow(BadRequestException);
        expect(datingReportModel.create).not.toHaveBeenCalled();
      });

      it('rejects when the caller owns neither side of the given match (IDOR-safe)', async () => {
        profileModel.findOne.mockResolvedValue({ _id: new Types.ObjectId() });
        matchModel.findById.mockResolvedValue({
          _id: matchId,
          petAId: petId,
          petBId: otherPetId,
        });
        petsService.findByIdAdmin.mockResolvedValue(
          makePet({ owner: otherOwnerId }),
        );

        await expect(
          service.report(ownerId, {
            targetPetId: otherPetId.toString(),
            reason: 'x',
            matchId,
          }),
        ).rejects.toThrow(NotFoundException);
      });
    });
  });

  describe('admin methods', () => {
    const adminId = new Types.ObjectId().toString();

    it('adminUpdateReportStatus throws NotFoundException for an unknown report', async () => {
      datingReportModel.findByIdAndUpdate.mockResolvedValue(null);

      await expect(
        service.adminUpdateReportStatus(
          adminId,
          'missing',
          DatingReportStatus.REVIEWED,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('adminUpdateReportStatus stamps reviewedBy/reviewedAt and logs the action', async () => {
      datingReportModel.findByIdAndUpdate.mockResolvedValue({
        status: DatingReportStatus.ACTIONED,
      });

      await service.adminUpdateReportStatus(
        adminId,
        'report-1',
        DatingReportStatus.ACTIONED,
      );

      expect(activityService.log).toHaveBeenCalledWith(
        adminId,
        'dating.report.status-changed',
        'report-1',
        { status: DatingReportStatus.ACTIONED },
      );
    });

    it('adminDeactivateProfile throws NotFoundException for an unknown profile', async () => {
      profileModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.adminDeactivateProfile('admin-1', petId.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('adminDeactivateProfile sets isActive false and logs the action', async () => {
      profileModel.findOneAndUpdate.mockResolvedValue({ isActive: false });

      await service.adminDeactivateProfile('admin-1', petId.toString());

      expect(activityService.log).toHaveBeenCalledWith(
        'admin-1',
        'admin.dating-profile.deactivated',
        petId.toString(),
      );
    });

    it('adminGetReportMessages throws NotFoundException for an unknown report', async () => {
      datingReportModel.findById.mockResolvedValue(null);

      await expect(
        service.adminGetReportMessages('admin-1', 'report-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('adminGetReportMessages throws BadRequestException for a report with no matchId', async () => {
      datingReportModel.findById.mockResolvedValue({ matchId: null });

      await expect(
        service.adminGetReportMessages('admin-1', 'report-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('adminGetReportMessages returns the conversation and logs the view', async () => {
      const matchObjectId = new Types.ObjectId();
      datingReportModel.findById.mockResolvedValue({
        matchId: matchObjectId,
      });
      const sort = jest.fn().mockResolvedValue([{ content: 'hi' }]);
      messageModel.find.mockReturnValue({ sort });

      const result = await service.adminGetReportMessages(
        'admin-1',
        'report-1',
      );

      expect(messageModel.find).toHaveBeenCalledWith({
        matchId: matchObjectId,
      });
      expect(result).toEqual([{ content: 'hi' }]);
      expect(activityService.log).toHaveBeenCalledWith(
        'admin-1',
        'dating.chat.viewed',
        'report-1',
        { matchId: matchObjectId.toString(), context: 'report-review' },
      );
    });
  });

  describe('cascade delete helpers', () => {
    it('deleteAllForPets skips the query entirely for an empty pet list', async () => {
      const result = await service.deleteAllForPets([]);

      expect(matchModel.find).not.toHaveBeenCalled();
      expect(profileModel.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({ deletedCount: 0 });
    });

    it('deleteAllForPets cascades matches/messages/swipes/reports before the profile itself', async () => {
      const matchDoc = { _id: new Types.ObjectId() };
      matchModel.find.mockResolvedValue([matchDoc]);
      profileModel.deleteMany.mockResolvedValue({ deletedCount: 1 });

      const result = await service.deleteAllForPets([petId.toString()]);

      expect(messageModel.deleteMany).toHaveBeenCalledWith({
        matchId: { $in: [matchDoc._id] },
      });
      expect(matchModel.deleteMany).toHaveBeenCalledWith({
        _id: { $in: [matchDoc._id] },
      });
      expect(swipeModel.deleteMany).toHaveBeenCalled();
      expect(datingReportModel.deleteMany).toHaveBeenCalled();
      expect(profileModel.deleteMany).toHaveBeenCalled();
      expect(
        datingChatNotificationService.deleteAllForMatches,
      ).toHaveBeenCalledWith([matchDoc._id]);
      expect(
        datingChatNotificationService.deleteAllForPets,
      ).toHaveBeenCalledWith([petId.toString()]);
      expect(result).toEqual({ deletedCount: 1 });
    });

    it('deleteReportsByReporter deletes every report filed by this user', async () => {
      datingReportModel.deleteMany.mockResolvedValue({ deletedCount: 2 });

      const result = await service.deleteReportsByReporter(ownerId);

      expect(datingReportModel.deleteMany).toHaveBeenCalledWith({
        reporterUserId: new Types.ObjectId(ownerId),
      });
      expect(result).toEqual({ deletedCount: 2 });
    });
  });
});
