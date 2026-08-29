import { Controller, Get, Param, UseGuards } from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { FoundReportsService } from './found-reports.service';
import { ParseMongoIdPipe } from '../../common/pipes/parse-mongo-id.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

// A second controller for the same underlying resource (FoundReport),
// rather than adding this route onto TagsController — TagsModule can't
// import FoundReportsModule without a circular dependency (FoundReportsModule
// already imports TagsModule for TagsService), but FoundReportsModule
// importing TagsModule the other way is exactly the existing, non-circular
// direction, so the route lives here instead.
@ApiTags('Found Reports')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('tags/:id/found-reports')
export class TagFoundReportsController {
  constructor(private readonly foundReportsService: FoundReportsService) {}

  @ApiOperation({
    summary: 'List found reports submitted against a tag the caller owns',
    description:
      "Scoped to the tag's whole history (not just its currently-linked pet), newest first.",
  })
  @ApiParam({ name: 'id', description: 'Tag ID' })
  @ApiResponse({
    status: 200,
    description: 'Array of found reports, newest first.',
  })
  @ApiResponse({ status: 403, description: 'Caller does not own this tag.' })
  @ApiResponse({ status: 404, description: 'Tag not found.' })
  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseMongoIdPipe) id: string,
  ) {
    return this.foundReportsService.findForOwnedTag(
      user.sub,
      id,
      (user.role as UserRole) === UserRole.ADMIN,
    );
  }
}
