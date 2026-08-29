import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';

import { PublicService } from './public.service';
import { Pet } from '../pets/schemas/pet.schema';
import { Tag } from '../tags/schemas/tag.schema';
import { ScansService } from '../scans/scans.service';
import { FoundReportsService } from '../found-reports/found-reports.service';
import { TagStatus } from '../../common/enums/tag-status.enum';

describe('PublicService', () => {
  let service: PublicService;
  let petModel: {
    findByIdAndUpdate: jest.Mock;
    find: jest.Mock;
    aggregate: jest.Mock;
  };
  let tagModel: { findOne: jest.Mock; find: jest.Mock };
  let scansService: { record: jest.Mock };
  let foundReportsService: { create: jest.Mock };

  const petId = new Types.ObjectId();

  beforeEach(async () => {
    petModel = {
      findByIdAndUpdate: jest.fn(),
      find: jest.fn(),
      aggregate: jest.fn(),
    };
    tagModel = { findOne: jest.fn(), find: jest.fn() };
    scansService = { record: jest.fn().mockResolvedValue(undefined) };
    foundReportsService = {
      create: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        tag: new Types.ObjectId(),
        pet: petId,
        message: 'Found near the park',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicService,
        { provide: getModelToken(Pet.name), useValue: petModel },
        { provide: getModelToken(Tag.name), useValue: tagModel },
        { provide: ScansService, useValue: scansService },
        { provide: FoundReportsService, useValue: foundReportsService },
      ],
    }).compile();

    service = module.get<PublicService>(PublicService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPetProfile', () => {
    it('returns the not-linked message for a code that was never issued', async () => {
      tagModel.findOne.mockResolvedValue(null);

      const result = await service.getPetProfile('UNKNOWN');

      expect(result).toEqual({
        tagStatus: TagStatus.AVAILABLE,
        message: 'This QR is not linked to a pet.',
      });
    });

    it('includes notableTrait, birthDate, weight, and a plain petStatus label for a linked pet', async () => {
      tagModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
        publicCode: 'CODE1',
        status: TagStatus.ASSIGNED,
        assignedPetId: petId,
      });
      petModel.findByIdAndUpdate.mockResolvedValue({
        name: 'Milo',
        species: 'Cat',
        breed: 'Persian',
        gender: 'Male',
        color: 'White',
        birthDate: new Date('2022-05-01'),
        weight: 4.2,
        notableTrait: 'Friendly but startles easily.',
        isLost: true,
        profileImage: '/uploads/pets/milo.png',
        lastSeenLocation: 'Dhanmondi',
        lostDate: new Date('2026-08-01'),
        lostDescription: 'Wearing a red collar.',
        reward: 50,
        emergencyContact: '+8801XXXXXXXXX',
      });

      const result = await service.getPetProfile('CODE1');

      expect(result).toEqual(
        expect.objectContaining({
          petStatus: 'MISSING',
          notableTrait: 'Friendly but startles easily.',
          weight: 4.2,
          birthDate: new Date('2022-05-01'),
        }),
      );
    });

    it('reports petStatus SAFE for a pet that is not lost', async () => {
      tagModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
        publicCode: 'CODE1',
        status: TagStatus.ASSIGNED,
        assignedPetId: petId,
      });
      petModel.findByIdAndUpdate.mockResolvedValue({
        name: 'Milo',
        species: 'Cat',
        isLost: false,
      });

      const result = await service.getPetProfile('CODE1');

      expect(result).toEqual(expect.objectContaining({ petStatus: 'SAFE' }));
    });

    // The public scan response is hand-built field-by-field in the service
    // rather than returned as a spread of the raw document — this test is a
    // regression guard for that: if a future change ever swaps in a spread,
    // it should fail here before it fails in production.
    it('never exposes the pet document internals or owner identity', async () => {
      tagModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
        publicCode: 'CODE1',
        status: TagStatus.ASSIGNED,
        assignedPetId: petId,
      });
      petModel.findByIdAndUpdate.mockResolvedValue({
        _id: petId,
        __v: 0,
        name: 'Milo',
        species: 'Cat',
        isLost: false,
        owner: new Types.ObjectId(),
      });

      const result = await service.getPetProfile('CODE1');

      expect(result).not.toHaveProperty('_id');
      expect(result).not.toHaveProperty('__v');
      expect(result).not.toHaveProperty('owner');
    });

    it('records a scan and returns a RETIRED status message without leaking a pet profile', async () => {
      const tagId = new Types.ObjectId();
      tagModel.findOne.mockResolvedValue({
        _id: tagId,
        publicCode: 'CODE1',
        status: TagStatus.RETIRED,
        assignedPetId: petId,
      });

      const result = await service.getPetProfile('CODE1', 'Mozilla/5.0');

      expect(result).toEqual({
        tagStatus: TagStatus.RETIRED,
        message: 'This tag has been retired and is no longer in use.',
      });
      expect(scansService.record).toHaveBeenCalledWith(
        tagId,
        null,
        'CODE1',
        'Mozilla/5.0',
      );
      expect(petModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('records a scan and returns a SUSPENDED status message', async () => {
      tagModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
        publicCode: 'CODE1',
        status: TagStatus.SUSPENDED,
        assignedPetId: petId,
      });

      const result = await service.getPetProfile('CODE1');

      expect(result).toEqual({
        tagStatus: TagStatus.SUSPENDED,
        message: 'This tag has been suspended.',
      });
    });

    it('returns "not linked" for a real, AVAILABLE tag that has never been assigned', async () => {
      tagModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
        publicCode: 'CODE1',
        status: TagStatus.AVAILABLE,
        assignedPetId: null,
      });

      const result = await service.getPetProfile('CODE1');

      expect(result).toEqual({
        tagStatus: TagStatus.AVAILABLE,
        message: 'This QR is not linked to a pet.',
      });
      expect(petModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('getLostPets', () => {
    it('maps each lost pet to its currently-assigned tag publicCode and never leaks an internal id', async () => {
      const otherPetId = new Types.ObjectId();
      petModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([
              { _id: petId, name: 'Milo', species: 'Cat' },
              { _id: otherPetId, name: 'Rex', species: 'Dog' },
            ]),
          }),
        }),
      });
      tagModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest
            .fn()
            .mockResolvedValue([{ assignedPetId: petId, publicCode: 'CODE1' }]),
        }),
      });

      const result = await service.getLostPets();

      expect(result).toEqual([
        expect.objectContaining({ name: 'Milo', publicCode: 'CODE1' }),
        expect.objectContaining({ name: 'Rex', publicCode: null }),
      ]);
      result.forEach((pet) => {
        expect(pet).not.toHaveProperty('_id');
      });
    });
  });

  describe('getNearbyLostPets', () => {
    it('runs a $geoNear aggregation scoped to isLost pets within the radius and rounds distance', async () => {
      petModel.aggregate.mockResolvedValue([
        {
          _id: petId,
          name: 'Milo',
          species: 'Cat',
          breed: 'Persian',
          distanceKm: 3.14159,
        },
      ]);
      tagModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest
            .fn()
            .mockResolvedValue([{ assignedPetId: petId, publicCode: 'CODE1' }]),
        }),
      });

      const result = await service.getNearbyLostPets({
        lat: 23.7,
        lng: 90.4,
        radiusKm: 5,
      });

      expect(petModel.aggregate).toHaveBeenCalledWith([
        expect.objectContaining({
          $geoNear: expect.objectContaining({
            near: { type: 'Point', coordinates: [90.4, 23.7] },
            maxDistance: 5000,
            query: { isLost: true },
            spherical: true,
          }) as object,
        }),
        expect.anything(),
      ]);
      expect(result).toEqual([
        expect.objectContaining({
          name: 'Milo',
          publicCode: 'CODE1',
          distanceKm: 3.1,
        }),
      ]);
      expect(result[0]).not.toHaveProperty('_id');
    });
  });

  describe('submitFoundReport', () => {
    it('returns only a sanitized confirmation, never the raw FoundReport document', async () => {
      const result = await service.submitFoundReport('CODE1', {
        message: 'Found near the park',
        deviceFingerprint: 'abc123',
      });

      expect(foundReportsService.create).toHaveBeenCalledWith(
        'CODE1',
        expect.objectContaining({ message: 'Found near the park' }),
        undefined,
      );
      expect(result).toEqual({
        message: 'Thanks — the owner has been notified.',
      });
      expect(result).not.toHaveProperty('_id');
      expect(result).not.toHaveProperty('tag');
      expect(result).not.toHaveProperty('pet');
    });
  });
});
