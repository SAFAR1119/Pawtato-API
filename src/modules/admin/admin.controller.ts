import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AdminService } from './admin.service';
import { ParseMongoIdPipe } from '../../common/pipes/parse-mongo-id.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ChangeRoleDto } from './dto/change-role.dto';
import { AdminUserQueryDto } from './dto/admin-user-query.dto';
import { AdminPetQueryDto } from './dto/admin-pet-query.dto';
import { AdminFoundReportQueryDto } from './dto/admin-found-report-query.dto';
import { UpdateFoundReportStatusDto } from './dto/update-found-report-status.dto';
import { AdminDatingReportQueryDto } from './dto/admin-dating-report-query.dto';
import { UpdateDatingReportStatusDto } from './dto/update-dating-report-status.dto';
import { AdminIdentityVerificationQueryDto } from './dto/admin-identity-verification-query.dto';
import { RejectIdentityVerificationDto } from './dto/reject-identity-verification.dto';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';
import { DashboardAnalyticsDto } from './dto/dashboard-analytics.dto';
import { AdminTagOrderQueryDto } from '../tag-orders/dto/admin-tag-order-query.dto';
import { ShipTagOrderDto } from '../tag-orders/dto/ship-tag-order.dto';

@ApiTags('Admin')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @ApiOperation({ summary: 'Get dashboard summary statistics (admin only)' })
  @ApiResponse({ status: 200, type: DashboardStatsDto })
  @Get('dashboard')
  dashboard() {
    return this.adminService.dashboard();
  }

  @ApiOperation({ summary: 'Search/list users (admin only)' })
  @ApiResponse({ status: 200, description: 'Paginated list of users.' })
  @Get('users')
  findAllUsers(
    @Query()
    query: AdminUserQueryDto,
  ) {
    return this.adminService.users(query);
  }

  @ApiOperation({ summary: 'Get a single user by ID (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'The user.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @Get('users/:id')
  findUser(
    @Param('id', ParseMongoIdPipe)
    id: string,
  ) {
    return this.adminService.user(id);
  }

  @ApiOperation({ summary: 'Block a user (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User blocked.' })
  @Patch('users/:id/block')
  blockUser(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    id: string,
  ) {
    return this.adminService.block(user.sub, id);
  }

  @ApiOperation({ summary: 'Unblock a user (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User unblocked.' })
  @Patch('users/:id/unblock')
  unblockUser(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    id: string,
  ) {
    return this.adminService.unblock(user.sub, id);
  }

  @ApiOperation({ summary: "Change a user's role (admin only)" })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Role updated.' })
  @Patch('users/:id/role')
  changeRole(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    id: string,

    @Body()
    dto: ChangeRoleDto,
  ) {
    return this.adminService.changeRole(user.sub, id, dto.role);
  }

  @ApiOperation({ summary: 'Delete a user (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User deleted.' })
  @Delete('users/:id')
  deleteUser(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    id: string,
  ) {
    return this.adminService.delete(user.sub, id);
  }

  @ApiOperation({ summary: 'Search/list pets (admin only)' })
  @ApiResponse({ status: 200, description: 'Paginated list of pets.' })
  @Get('pets')
  findAllPets(
    @Query()
    query: AdminPetQueryDto,
  ) {
    return this.adminService.pets(query);
  }

  @ApiOperation({ summary: 'Get a single pet by ID (admin only)' })
  @ApiParam({ name: 'id', description: 'Pet ID' })
  @ApiResponse({ status: 200, description: 'The pet.' })
  @ApiResponse({ status: 404, description: 'Pet not found.' })
  @Get('pets/:id')
  findPet(
    @Param('id', ParseMongoIdPipe)
    id: string,
  ) {
    return this.adminService.pet(id);
  }

  @ApiOperation({ summary: 'Force-mark a pet as recovered (admin only)' })
  @ApiParam({ name: 'id', description: 'Pet ID' })
  @ApiResponse({ status: 200, description: 'Pet marked as recovered.' })
  @Patch('pets/:id/recover')
  recoverPet(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    id: string,
  ) {
    return this.adminService.recoverPet(user.sub, id);
  }

  @ApiOperation({ summary: 'Delete a pet (admin only)' })
  @ApiParam({ name: 'id', description: 'Pet ID' })
  @ApiResponse({ status: 200, description: 'Pet deleted.' })
  @Delete('pets/:id')
  deletePet(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    id: string,
  ) {
    return this.adminService.deletePet(user.sub, id);
  }

  @ApiOperation({ summary: 'Get platform analytics (admin only)' })
  @ApiResponse({ status: 200, type: DashboardAnalyticsDto })
  @Get('analytics')
  analytics() {
    return this.adminService.analytics();
  }

  @ApiOperation({
    summary: 'List found reports for abuse review (admin only)',
    description:
      'Global, unscoped by pet/tag ownership — the moderation queue for spam/malicious finder ' +
      'reports. Filter by `status` and/or `deviceFingerprint` (the latter surfaces every report ' +
      'submitted by one device, useful for spotting a farming pattern across many tags).',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of found reports.',
  })
  @Get('found-reports')
  findAllFoundReports(
    @Query()
    query: AdminFoundReportQueryDto,
  ) {
    return this.adminService.foundReports(query);
  }

  @ApiOperation({
    summary: "Update a found report's moderation status (admin only)",
    description:
      'Stamps `reviewedBy`/`reviewedAt` with the acting admin. Does not itself suspend the ' +
      "associated tag — pair with PATCH /tags/{id}/suspend when a report's status warrants it.",
  })
  @ApiParam({ name: 'id', description: 'Found report ID' })
  @ApiResponse({ status: 200, description: 'Found report status updated.' })
  @ApiResponse({ status: 404, description: 'Found report not found.' })
  @Patch('found-reports/:id/status')
  updateFoundReportStatus(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    id: string,

    @Body()
    dto: UpdateFoundReportStatusDto,
  ) {
    return this.adminService.updateFoundReportStatus(user.sub, id, dto.status);
  }

  @ApiOperation({
    summary: 'List dating-profile abuse reports for moderation (admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of dating reports.',
  })
  @Get('dating/reports')
  findAllDatingReports(
    @Query()
    query: AdminDatingReportQueryDto,
  ) {
    return this.adminService.datingReports(query);
  }

  @ApiOperation({
    summary: "Update a dating report's moderation status (admin only)",
    description:
      'Stamps `reviewedBy`/`reviewedAt` with the acting admin. Does not itself deactivate the ' +
      'reported profile — pair with PATCH /admin/dating/profiles/{petId}/deactivate when warranted.',
  })
  @ApiParam({ name: 'id', description: 'Dating report ID' })
  @ApiResponse({ status: 200, description: 'Dating report status updated.' })
  @ApiResponse({ status: 404, description: 'Dating report not found.' })
  @Patch('dating/reports/:id/status')
  updateDatingReportStatus(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    id: string,

    @Body()
    dto: UpdateDatingReportStatusDto,
  ) {
    return this.adminService.updateDatingReportStatus(user.sub, id, dto.status);
  }

  @ApiOperation({
    summary: "Deactivate a pet's dating profile (admin only)",
    description:
      'Sets `isActive: false` on the profile — the pet drops out of discovery immediately. ' +
      'Existing matches/messages are left untouched.',
  })
  @ApiParam({ name: 'petId', description: 'Pet ID' })
  @ApiResponse({ status: 200, description: 'Dating profile deactivated.' })
  @ApiResponse({ status: 404, description: 'Dating profile not found.' })
  @Patch('dating/profiles/:petId/deactivate')
  deactivateDatingProfile(
    @CurrentUser() user: JwtPayload,

    @Param('petId', ParseMongoIdPipe)
    petId: string,
  ) {
    return this.adminService.deactivateDatingProfile(user.sub, petId);
  }

  @ApiOperation({
    summary:
      "View a dating report's conversation, if it was filed with one (admin only)",
    description:
      'On-demand only — never included in the report list, fetched only when an admin actually ' +
      'opens it, and audit-logged every time (`dating.chat.viewed`), same pattern as NID review.',
  })
  @ApiParam({ name: 'id', description: 'Dating report ID' })
  @ApiResponse({
    status: 200,
    description: "The conversation's messages, oldest first.",
  })
  @ApiResponse({ status: 404, description: 'Dating report not found.' })
  @ApiResponse({
    status: 400,
    description:
      'This report was filed without a matchId — no conversation to show.',
  })
  @Get('dating/reports/:id/messages')
  getDatingReportMessages(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    id: string,
  ) {
    return this.adminService.datingReportMessages(user.sub, id);
  }

  @ApiOperation({
    summary:
      'List identity (NID) verification submissions for review (admin only)',
    description:
      'Never includes the stored image keys/URLs — fetch those on demand per submission via ' +
      'GET /admin/dating/verifications/{id}/images.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of identity verification submissions.',
  })
  @Get('dating/verifications')
  findAllIdentityVerifications(
    @Query()
    query: AdminIdentityVerificationQueryDto,
  ) {
    return this.adminService.identityVerifications(query);
  }

  @ApiOperation({
    summary:
      "Get a submission's NID images via short-lived signed URLs (admin only)",
    description:
      'On-demand only — opening this endpoint is audit-logged, same as the matched-party NID exchange.',
  })
  @ApiParam({ name: 'id', description: 'Identity verification ID' })
  @ApiResponse({
    status: 200,
    description: 'Short-lived signed URLs to the front/back NID images.',
  })
  @ApiResponse({ status: 404, description: 'Identity verification not found.' })
  @Get('dating/verifications/:id/images')
  getIdentityVerificationImages(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    id: string,
  ) {
    return this.adminService.identityVerificationImages(user.sub, id);
  }

  @ApiOperation({
    summary: 'Approve an identity verification submission (admin only)',
  })
  @ApiParam({ name: 'id', description: 'Identity verification ID' })
  @ApiResponse({ status: 200, description: 'Verification approved.' })
  @ApiResponse({ status: 404, description: 'Identity verification not found.' })
  @Patch('dating/verifications/:id/approve')
  approveIdentityVerification(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    id: string,
  ) {
    return this.adminService.approveIdentityVerification(user.sub, id);
  }

  @ApiOperation({
    summary: 'Reject an identity verification submission (admin only)',
    description:
      'The reason is shown verbatim to the user on their status screen.',
  })
  @ApiParam({ name: 'id', description: 'Identity verification ID' })
  @ApiResponse({ status: 200, description: 'Verification rejected.' })
  @ApiResponse({ status: 404, description: 'Identity verification not found.' })
  @Patch('dating/verifications/:id/reject')
  rejectIdentityVerification(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    id: string,

    @Body()
    dto: RejectIdentityVerificationDto,
  ) {
    return this.adminService.rejectIdentityVerification(
      user.sub,
      id,
      dto.reason,
    );
  }

  @ApiOperation({ summary: 'List QR tag orders (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of tag orders.',
  })
  @Get('tag-orders')
  findAllTagOrders(
    @Query()
    query: AdminTagOrderQueryDto,
  ) {
    return this.adminService.tagOrders(query);
  }

  @ApiOperation({
    summary: 'Mark a paid tag order as shipped (admin only)',
    description:
      'Only a PAID order can be marked shipped. Stamps trackingNumber/fulfilledAt.',
  })
  @ApiParam({ name: 'id', description: 'Tag order ID' })
  @ApiResponse({ status: 200, description: 'Tag order marked as shipped.' })
  @ApiResponse({ status: 404, description: 'Tag order not found.' })
  @ApiResponse({
    status: 400,
    description: 'The order is not in PAID status.',
  })
  @Patch('tag-orders/:id/ship')
  markTagOrderShipped(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    id: string,

    @Body()
    dto: ShipTagOrderDto,
  ) {
    return this.adminService.markTagOrderShipped(user.sub, id, dto);
  }
}
