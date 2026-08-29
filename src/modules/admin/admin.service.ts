import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { PetsService } from '../pets/pets.service';
import { TagsService } from '../tags/tags.service';
import { ScansService } from '../scans/scans.service';
import { VaccinationsService } from '../vaccinations/vaccinations.service';
import { MedicalService } from '../medical/medical.service';
import { FoundReportsService } from '../found-reports/found-reports.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityService } from '../activity/activity.service';
import { DatingService } from '../dating/dating.service';
import { IdentityVerificationService } from '../dating/identity-verification.service';
import { CaretakersService } from '../caretakers/caretakers.service';
import { TagOrdersService } from '../tag-orders/tag-orders.service';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';
import { AdminUserQueryDto } from './dto/admin-user-query.dto';
import { UserRole } from '../../common/enums/user-role.enum';
import { AdminPetQueryDto } from './dto/admin-pet-query.dto';
import { AdminFoundReportQueryDto } from './dto/admin-found-report-query.dto';
import { FoundReportStatus } from '../../common/enums/found-report-status.enum';
import type { AdminDatingReportQueryDto } from './dto/admin-dating-report-query.dto';
import { DatingReportStatus } from '../../common/enums/dating-report-status.enum';
import type { AdminIdentityVerificationQueryDto } from './dto/admin-identity-verification-query.dto';
import type { AdminTagOrderQueryDto } from '../tag-orders/dto/admin-tag-order-query.dto';
import type { ShipTagOrderDto } from '../tag-orders/dto/ship-tag-order.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly usersService: UsersService,
    private readonly petsService: PetsService,
    private readonly tagsService: TagsService,
    private readonly scansService: ScansService,
    private readonly vaccinationsService: VaccinationsService,
    private readonly medicalService: MedicalService,
    private readonly foundReportsService: FoundReportsService,
    private readonly notificationsService: NotificationsService,
    private readonly datingService: DatingService,
    private readonly identityVerificationService: IdentityVerificationService,
    private readonly caretakersService: CaretakersService,
    private readonly tagOrdersService: TagOrdersService,
    private readonly activityService: ActivityService,
  ) {}

  async dashboard(): Promise<DashboardStatsDto> {
    return {
      totalUsers: await this.usersService.count(),

      totalPets: await this.petsService.count(),

      lostPets: await this.petsService.countLost(),

      recoveredPets: await this.petsService.countRecovered(),

      totalVaccinations: await this.vaccinationsService.count(),

      totalMedicalRecords: await this.medicalService.count(),
    };
  }

  async users(query: AdminUserQueryDto) {
    return this.usersService.findAll(query);
  }

  async user(id: string) {
    return this.usersService.findById(id);
  }

  async block(actorId: string, id: string) {
    const result = await this.usersService.blockUser(id);

    await this.activityService.log(actorId, 'admin.user.blocked', id);

    return result;
  }

  async unblock(actorId: string, id: string) {
    const result = await this.usersService.unblockUser(id);

    await this.activityService.log(actorId, 'admin.user.unblocked', id);

    return result;
  }

  async changeRole(actorId: string, id: string, role: UserRole) {
    const result = await this.usersService.changeRole(id, role);

    await this.activityService.log(actorId, 'admin.user.role-changed', id, {
      role,
    });

    return result;
  }

  // Deletes a user and everything connected to them: every pet they own,
  // every tag they own (assigned to one of those pets or not), and
  // everything that in turn references those pets/tags (medical records,
  // vaccinations, scan history, found reports, in-app notifications, dating
  // profiles/swipes/matches/messages, caretaker grants on their own pets),
  // plus every dating report this user filed against someone else's pet,
  // plus their identity-verification record and its private NID files
  // (Phase 11 — user-scoped, not pet-scoped, so this doesn't fall out of
  // the petIds-based cascade above), plus their own caretaker access on
  // *other* people's pets (Phase 15 — also user-scoped, same reasoning),
  // plus every stored file along the way (avatar, pet photos, tag QR
  // images, found-report photos). Deliberately
  // not wrapped in a Mongo transaction —
  // this project's MongoDB isn't running as a replica set (see
  // PAWTATO_ROADMAP.md's Phase 8 notes), which transactions require.
  //
  // Runs children-first (scans/found-reports/medical/vaccinations, then
  // tags/pets, then notifications, then the user) specifically so a crash
  // partway through leaves the least damage: if it dies before reaching the
  // tags/pets step, every id needed to retry is still derivable by querying
  // Pet.owner/Tag.ownerId again, since those documents are still there.
  //
  // What this intentionally does NOT delete: Activity audit-log entries
  // where this user is the actor (or target) — the audit trail is meant to
  // outlive the account it describes, the same way it isn't purged when a
  // pet or tag is deleted either — and FoundReport.reviewedBy stamps left by
  // this user reviewing *other* people's reports, which are a historical
  // record of moderation, not this user's own data.
  async delete(actorId: string, id: string) {
    const user = await this.usersService.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [petIds, tagIds] = await Promise.all([
      this.petsService.findIdsForOwner(id),
      this.tagsService.findIdsForOwner(id),
    ]);

    await this.scansService.deleteAllForPetsAndTags(petIds, tagIds);
    await this.foundReportsService.deleteAllForPetsAndTags(petIds, tagIds);
    await this.medicalService.deleteAllForPets(petIds);
    await this.vaccinationsService.deleteAllForPets(petIds);

    await this.datingService.deleteAllForPets(petIds);
    await this.datingService.deleteReportsByReporter(id);
    await this.identityVerificationService.deleteForUser(id);

    // Both directions: caretaker rows on this user's own pets (petIds-based,
    // same as every other pet-keyed collection above) and rows where this
    // user was themselves a caretaker on someone else's pet (userId-based —
    // their access there must end when their account does).
    await this.caretakersService.deleteAllForPets(petIds);
    await this.caretakersService.deleteAllForCaretakerUser(id);

    await this.tagsService.deleteAllForOwner(id);
    await this.petsService.deleteAllForOwner(id);

    await this.notificationsService.deleteAllForUser(id);

    const result = await this.usersService.deleteUser(id);

    await this.activityService.log(actorId, 'admin.user.deleted', id, {
      deletedPetCount: petIds.length,
      deletedTagCount: tagIds.length,
    });

    return result;
  }

  async pets(query: AdminPetQueryDto) {
    return this.petsService.findAllAdmin(query);
  }

  async pet(id: string) {
    return this.petsService.findByIdAdmin(id);
  }

  async recoverPet(actorId: string, id: string) {
    const result = await this.petsService.recoverPet(id);

    await this.activityService.log(actorId, 'admin.pet.recovered', id);

    return result;
  }

  // Deletes a single pet and everything connected to it (its assigned tag +
  // QR image, medical records, vaccinations, scan history, found reports,
  // dating profile/swipes/matches/messages/reports-against-it, caretaker
  // grants), without
  // touching the owner's other pets/tags. See delete() above for the
  // equivalent whole-user cascade.
  async deletePet(actorId: string, id: string) {
    const tagIds = await this.tagsService.findIdsForPet(id);

    await this.scansService.deleteAllForPetsAndTags([id], tagIds);
    await this.foundReportsService.deleteAllForPetsAndTags([id], tagIds);
    await this.medicalService.deleteAllForPets([id]);
    await this.vaccinationsService.deleteAllForPets([id]);
    await this.datingService.deleteAllForPets([id]);
    await this.caretakersService.deleteAllForPets([id]);
    await this.tagsService.deleteAllForPet(id);

    const result = await this.petsService.deletePet(id);

    await this.activityService.log(actorId, 'admin.pet.deleted', id, {
      deletedTagCount: tagIds.length,
    });

    return result;
  }

  async analytics() {
    return {
      monthlyUsers: await this.usersService.monthlyRegistrations(),

      monthlyPets: await this.petsService.monthlyRegistrations(),

      speciesDistribution: await this.petsService.speciesDistribution(),

      lostVsRecovered: {
        lost: await this.petsService.countLost(),

        recovered: await this.petsService.countRecovered(),
      },

      topScannedPets: await this.petsService.topScannedPets(),
    };
  }

  async foundReports(query: AdminFoundReportQueryDto) {
    return this.foundReportsService.findAllAdmin(query);
  }

  async updateFoundReportStatus(
    actorId: string,
    id: string,
    status: FoundReportStatus,
  ) {
    return this.foundReportsService.updateStatus(id, actorId, status);
  }

  async datingReports(query: AdminDatingReportQueryDto) {
    return this.datingService.adminListReports(query);
  }

  async updateDatingReportStatus(
    actorId: string,
    id: string,
    status: DatingReportStatus,
  ) {
    return this.datingService.adminUpdateReportStatus(actorId, id, status);
  }

  async deactivateDatingProfile(actorId: string, petId: string) {
    return this.datingService.adminDeactivateProfile(actorId, petId);
  }

  async tagOrders(query: AdminTagOrderQueryDto) {
    return this.tagOrdersService.adminList(query);
  }

  async markTagOrderShipped(actorId: string, id: string, dto: ShipTagOrderDto) {
    return this.tagOrdersService.adminMarkShipped(actorId, id, dto);
  }

  async datingReportMessages(actorId: string, reportId: string) {
    return this.datingService.adminGetReportMessages(actorId, reportId);
  }

  async identityVerifications(query: AdminIdentityVerificationQueryDto) {
    return this.identityVerificationService.adminList(query);
  }

  async identityVerificationImages(actorId: string, id: string) {
    return this.identityVerificationService.adminGetSignedImages(actorId, id);
  }

  async approveIdentityVerification(actorId: string, id: string) {
    return this.identityVerificationService.adminApprove(actorId, id);
  }

  async rejectIdentityVerification(
    actorId: string,
    id: string,
    reason: string,
  ) {
    return this.identityVerificationService.adminReject(actorId, id, reason);
  }
}
