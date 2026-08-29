import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ActivityService } from './activity.service';
import { ActivityQueryDto } from './dto/activity-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

@ApiTags('Activity')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @ApiOperation({
    summary: 'List the audit log (admin only)',
    description:
      'Covers both admin-panel actions (user/pet moderation, tag lifecycle, found-report review) ' +
      "and sensitive self-service actions (tag assign/unassign/claim, a pet's lost/found status " +
      'changes) — filterable by actor and/or action.',
  })
  @ApiResponse({ status: 200, description: 'Paginated audit log entries.' })
  @Get()
  findAll(@Query() query: ActivityQueryDto) {
    return this.activityService.findAll(query);
  }
}
