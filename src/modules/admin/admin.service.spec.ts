import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { UsersService } from '../users/users.service';
import { PetsService } from '../pets/pets.service';
import { TagsService } from '../tags/tags.service';
import { ScansService } from '../scans/scans.service';
import { VaccinationsService } from '../vaccinations/vaccinations.service';
import { MedicalService } from '../medical/medical.service';
import { FoundReportsService } from '../found-reports/found-reports.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DatingService } from '../dating/dating.service';
import { IdentityVerificationService } from '../dating/identity-verification.service';
import { CaretakersService } from '../caretakers/caretakers.service';
import { TagOrdersService } from '../tag-orders/tag-orders.service';
import { ActivityService } from '../activity/activity.service';
import { TagOrderStatus } from '../../common/enums/tag-order-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { FoundReportStatus } from '../../common/enums/found-report-status.enum';
import { DatingReportStatus } from '../../common/enums/dating-report-status.enum';
import { IdentityVerificationStatus } from '../../common/enums/identity-verification-status.enum';

describe('AdminService', () => {
  let service: AdminService;
  let usersService: {
    count: jest.Mock;
    findById: jest.Mock;
    blockUser: jest.Mock;
    unblockUser: jest.Mock;
    changeRole: jest.Mock;
    deleteUser: jest.Mock;
  };
  let petsService: {
    count: jest.Mock;
    countLost: jest.Mock;
    countRecovered: jest.Mock;
    recoverPet: jest.Mock;
    deletePet: jest.Mock;
    findIdsForOwner: jest.Mock;
    deleteAllForOwner: jest.Mock;
  };
  let tagsService: {
    findIdsForOwner: jest.Mock;
    findIdsForPet: jest.Mock;
    deleteAllForOwner: jest.Mock;
    deleteAllForPet: jest.Mock;
  };
  let scansService: { deleteAllForPetsAndTags: jest.Mock };
  let vaccinationsService: { count: jest.Mock; deleteAllForPets: jest.Mock };
  let medicalService: { count: jest.Mock; deleteAllForPets: jest.Mock };
  let foundReportsService: {
    findAllAdmin: jest.Mock;
    updateStatus: jest.Mock;
    deleteAllForPetsAndTags: jest.Mock;
  };
  let notificationsService: { deleteAllForUser: jest.Mock };
  let datingService: {
    deleteAllForPets: jest.Mock;
    deleteReportsByReporter: jest.Mock;
    adminListReports: jest.Mock;
    adminUpdateReportStatus: jest.Mock;
    adminDeactivateProfile: jest.Mock;
  };
  let identityVerificationService: {
    adminList: jest.Mock;
    adminGetSignedImages: jest.Mock;
    adminApprove: jest.Mock;
    adminReject: jest.Mock;
    deleteForUser: jest.Mock;
  };
  let caretakersService: {
    deleteAllForPets: jest.Mock;
    deleteAllForCaretakerUser: jest.Mock;
  };
  let tagOrdersService: { adminList: jest.Mock; adminMarkShipped: jest.Mock };
  let activityService: { log: jest.Mock };

  const actorId = 'admin-1';

  beforeEach(async () => {
    usersService = {
      count: jest.fn().mockResolvedValue(10),
      findById: jest.fn().mockResolvedValue({ _id: 'user-1' }),
      blockUser: jest.fn().mockResolvedValue({ blocked: true }),
      unblockUser: jest.fn().mockResolvedValue({ blocked: false }),
      changeRole: jest.fn().mockResolvedValue({ role: UserRole.ADMIN }),
      deleteUser: jest.fn().mockResolvedValue({ message: 'deleted' }),
    };
    petsService = {
      count: jest.fn().mockResolvedValue(5),
      countLost: jest.fn().mockResolvedValue(2),
      countRecovered: jest.fn().mockResolvedValue(3),
      recoverPet: jest.fn().mockResolvedValue({ isLost: false }),
      deletePet: jest.fn().mockResolvedValue({ message: 'deleted' }),
      findIdsForOwner: jest.fn().mockResolvedValue([]),
      deleteAllForOwner: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    tagsService = {
      findIdsForOwner: jest.fn().mockResolvedValue([]),
      findIdsForPet: jest.fn().mockResolvedValue([]),
      deleteAllForOwner: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      deleteAllForPet: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    scansService = {
      deleteAllForPetsAndTags: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    vaccinationsService = {
      count: jest.fn().mockResolvedValue(7),
      deleteAllForPets: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    medicalService = {
      count: jest.fn().mockResolvedValue(4),
      deleteAllForPets: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    foundReportsService = {
      findAllAdmin: jest.fn().mockResolvedValue({ foundReports: [] }),
      updateStatus: jest
        .fn()
        .mockResolvedValue({ status: FoundReportStatus.REVIEWED }),
      deleteAllForPetsAndTags: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    notificationsService = {
      deleteAllForUser: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    datingService = {
      deleteAllForPets: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      deleteReportsByReporter: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      adminListReports: jest.fn().mockResolvedValue({ reports: [] }),
      adminUpdateReportStatus: jest
        .fn()
        .mockResolvedValue({ status: DatingReportStatus.REVIEWED }),
      adminDeactivateProfile: jest.fn().mockResolvedValue({ isActive: false }),
    };
    identityVerificationService = {
      adminList: jest.fn().mockResolvedValue({ verifications: [] }),
      adminGetSignedImages: jest
        .fn()
        .mockResolvedValue({ frontUrl: 'front', backUrl: 'back' }),
      adminApprove: jest
        .fn()
        .mockResolvedValue({ status: IdentityVerificationStatus.APPROVED }),
      adminReject: jest
        .fn()
        .mockResolvedValue({ status: IdentityVerificationStatus.REJECTED }),
      deleteForUser: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    caretakersService = {
      deleteAllForPets: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      deleteAllForCaretakerUser: jest
        .fn()
        .mockResolvedValue({ deletedCount: 0 }),
    };
    tagOrdersService = {
      adminList: jest.fn().mockResolvedValue({ orders: [] }),
      adminMarkShipped: jest
        .fn()
        .mockResolvedValue({ status: TagOrderStatus.FULFILLED }),
    };
    activityService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: UsersService, useValue: usersService },
        { provide: PetsService, useValue: petsService },
        { provide: TagsService, useValue: tagsService },
        { provide: ScansService, useValue: scansService },
        { provide: VaccinationsService, useValue: vaccinationsService },
        { provide: MedicalService, useValue: medicalService },
        { provide: FoundReportsService, useValue: foundReportsService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: DatingService, useValue: datingService },
        {
          provide: IdentityVerificationService,
          useValue: identityVerificationService,
        },
        { provide: CaretakersService, useValue: caretakersService },
        { provide: TagOrdersService, useValue: tagOrdersService },
        { provide: ActivityService, useValue: activityService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('dashboard', () => {
    it('aggregates counts from every dependent service', async () => {
      const result = await service.dashboard();

      expect(result).toEqual({
        totalUsers: 10,
        totalPets: 5,
        lostPets: 2,
        recoveredPets: 3,
        totalVaccinations: 7,
        totalMedicalRecords: 4,
      });
    });
  });

  describe('user moderation delegation + audit logging', () => {
    it('block delegates to UsersService.blockUser and logs the action', async () => {
      await service.block(actorId, 'user-1');

      expect(usersService.blockUser).toHaveBeenCalledWith('user-1');
      expect(activityService.log).toHaveBeenCalledWith(
        actorId,
        'admin.user.blocked',
        'user-1',
      );
    });

    it('unblock delegates to UsersService.unblockUser and logs the action', async () => {
      await service.unblock(actorId, 'user-1');

      expect(usersService.unblockUser).toHaveBeenCalledWith('user-1');
      expect(activityService.log).toHaveBeenCalledWith(
        actorId,
        'admin.user.unblocked',
        'user-1',
      );
    });

    it('changeRole delegates to UsersService.changeRole and logs the new role', async () => {
      await service.changeRole(actorId, 'user-1', UserRole.ADMIN);

      expect(usersService.changeRole).toHaveBeenCalledWith(
        'user-1',
        UserRole.ADMIN,
      );
      expect(activityService.log).toHaveBeenCalledWith(
        actorId,
        'admin.user.role-changed',
        'user-1',
        { role: UserRole.ADMIN },
      );
    });
  });

  describe('delete (cascade user deletion)', () => {
    it('throws NotFoundException for an unknown user and never touches any other collection', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(service.delete(actorId, 'missing')).rejects.toThrow(
        NotFoundException,
      );

      expect(petsService.findIdsForOwner).not.toHaveBeenCalled();
      expect(usersService.deleteUser).not.toHaveBeenCalled();
    });

    it('cascades every dependent collection before deleting the user, then logs the action', async () => {
      const petIds = ['pet-1', 'pet-2'];
      const tagIds = ['tag-1'];
      petsService.findIdsForOwner.mockResolvedValue(petIds);
      tagsService.findIdsForOwner.mockResolvedValue(tagIds);

      await service.delete(actorId, 'user-1');

      expect(scansService.deleteAllForPetsAndTags).toHaveBeenCalledWith(
        petIds,
        tagIds,
      );
      expect(foundReportsService.deleteAllForPetsAndTags).toHaveBeenCalledWith(
        petIds,
        tagIds,
      );
      expect(medicalService.deleteAllForPets).toHaveBeenCalledWith(petIds);
      expect(vaccinationsService.deleteAllForPets).toHaveBeenCalledWith(petIds);
      expect(datingService.deleteAllForPets).toHaveBeenCalledWith(petIds);
      expect(datingService.deleteReportsByReporter).toHaveBeenCalledWith(
        'user-1',
      );
      expect(identityVerificationService.deleteForUser).toHaveBeenCalledWith(
        'user-1',
      );
      expect(caretakersService.deleteAllForPets).toHaveBeenCalledWith(petIds);
      expect(caretakersService.deleteAllForCaretakerUser).toHaveBeenCalledWith(
        'user-1',
      );
      expect(tagsService.deleteAllForOwner).toHaveBeenCalledWith('user-1');
      expect(petsService.deleteAllForOwner).toHaveBeenCalledWith('user-1');
      expect(notificationsService.deleteAllForUser).toHaveBeenCalledWith(
        'user-1',
      );
      expect(usersService.deleteUser).toHaveBeenCalledWith('user-1');

      expect(activityService.log).toHaveBeenCalledWith(
        actorId,
        'admin.user.deleted',
        'user-1',
        { deletedPetCount: 2, deletedTagCount: 1 },
      );
    });

    it('deletes dependents before deleting the user itself (ordering)', async () => {
      const callOrder: string[] = [];
      medicalService.deleteAllForPets.mockImplementation(() => {
        callOrder.push('medical');
        return Promise.resolve({ deletedCount: 0 });
      });
      tagsService.deleteAllForOwner.mockImplementation(() => {
        callOrder.push('tags');
        return Promise.resolve({ deletedCount: 0 });
      });
      petsService.deleteAllForOwner.mockImplementation(() => {
        callOrder.push('pets');
        return Promise.resolve({ deletedCount: 0 });
      });
      usersService.deleteUser.mockImplementation(() => {
        callOrder.push('user');
        return Promise.resolve({ message: 'deleted' });
      });

      await service.delete(actorId, 'user-1');

      expect(callOrder).toEqual(['medical', 'tags', 'pets', 'user']);
    });
  });

  describe('pet moderation delegation + audit logging', () => {
    it('recoverPet delegates to PetsService.recoverPet and logs the action', async () => {
      await service.recoverPet(actorId, 'pet-1');

      expect(petsService.recoverPet).toHaveBeenCalledWith('pet-1');
      expect(activityService.log).toHaveBeenCalledWith(
        actorId,
        'admin.pet.recovered',
        'pet-1',
      );
    });

    it('deletePet cascades tags/medical/vaccinations/scans/found-reports for that pet only, then deletes it', async () => {
      tagsService.findIdsForPet.mockResolvedValue(['tag-1']);

      await service.deletePet(actorId, 'pet-1');

      expect(tagsService.findIdsForPet).toHaveBeenCalledWith('pet-1');
      expect(scansService.deleteAllForPetsAndTags).toHaveBeenCalledWith(
        ['pet-1'],
        ['tag-1'],
      );
      expect(foundReportsService.deleteAllForPetsAndTags).toHaveBeenCalledWith(
        ['pet-1'],
        ['tag-1'],
      );
      expect(medicalService.deleteAllForPets).toHaveBeenCalledWith(['pet-1']);
      expect(vaccinationsService.deleteAllForPets).toHaveBeenCalledWith([
        'pet-1',
      ]);
      expect(datingService.deleteAllForPets).toHaveBeenCalledWith(['pet-1']);
      expect(caretakersService.deleteAllForPets).toHaveBeenCalledWith([
        'pet-1',
      ]);
      expect(tagsService.deleteAllForPet).toHaveBeenCalledWith('pet-1');
      expect(petsService.deletePet).toHaveBeenCalledWith('pet-1');
      expect(activityService.log).toHaveBeenCalledWith(
        actorId,
        'admin.pet.deleted',
        'pet-1',
        { deletedTagCount: 1 },
      );
    });
  });

  describe('found-report moderation delegation', () => {
    it('foundReports delegates to FoundReportsService.findAllAdmin', async () => {
      const query = { page: 1, limit: 10 };

      await service.foundReports(query);

      expect(foundReportsService.findAllAdmin).toHaveBeenCalledWith(query);
    });

    it('updateFoundReportStatus delegates to FoundReportsService.updateStatus (which logs its own audit entry)', async () => {
      await service.updateFoundReportStatus(
        actorId,
        'report-1',
        FoundReportStatus.DISMISSED,
      );

      expect(foundReportsService.updateStatus).toHaveBeenCalledWith(
        'report-1',
        actorId,
        FoundReportStatus.DISMISSED,
      );
    });
  });

  describe('dating moderation delegation', () => {
    it('datingReports delegates to DatingService.adminListReports', async () => {
      const query = { page: 1, limit: 10 };

      await service.datingReports(query);

      expect(datingService.adminListReports).toHaveBeenCalledWith(query);
    });

    it('updateDatingReportStatus delegates to DatingService.adminUpdateReportStatus', async () => {
      await service.updateDatingReportStatus(
        actorId,
        'report-1',
        DatingReportStatus.ACTIONED,
      );

      expect(datingService.adminUpdateReportStatus).toHaveBeenCalledWith(
        actorId,
        'report-1',
        DatingReportStatus.ACTIONED,
      );
    });

    it('deactivateDatingProfile delegates to DatingService.adminDeactivateProfile', async () => {
      await service.deactivateDatingProfile(actorId, 'pet-1');

      expect(datingService.adminDeactivateProfile).toHaveBeenCalledWith(
        actorId,
        'pet-1',
      );
    });
  });

  describe('identity verification delegation', () => {
    it('identityVerifications delegates to IdentityVerificationService.adminList', async () => {
      const query = { page: 1, limit: 10 };

      await service.identityVerifications(query);

      expect(identityVerificationService.adminList).toHaveBeenCalledWith(query);
    });

    it('identityVerificationImages delegates to IdentityVerificationService.adminGetSignedImages', async () => {
      await service.identityVerificationImages(actorId, 'v1');

      expect(
        identityVerificationService.adminGetSignedImages,
      ).toHaveBeenCalledWith(actorId, 'v1');
    });

    it('approveIdentityVerification delegates to IdentityVerificationService.adminApprove', async () => {
      await service.approveIdentityVerification(actorId, 'v1');

      expect(identityVerificationService.adminApprove).toHaveBeenCalledWith(
        actorId,
        'v1',
      );
    });

    it('rejectIdentityVerification delegates to IdentityVerificationService.adminReject', async () => {
      await service.rejectIdentityVerification(actorId, 'v1', 'blurry');

      expect(identityVerificationService.adminReject).toHaveBeenCalledWith(
        actorId,
        'v1',
        'blurry',
      );
    });
  });

  describe('tag order delegation', () => {
    it('tagOrders delegates to TagOrdersService.adminList', async () => {
      const query = { page: 1, limit: 10 };

      await service.tagOrders(query);

      expect(tagOrdersService.adminList).toHaveBeenCalledWith(query);
    });

    it('markTagOrderShipped delegates to TagOrdersService.adminMarkShipped', async () => {
      const dto = { trackingNumber: 'TRACK1' };

      await service.markTagOrderShipped(actorId, 'order-1', dto);

      expect(tagOrdersService.adminMarkShipped).toHaveBeenCalledWith(
        actorId,
        'order-1',
        dto,
      );
    });
  });
});
