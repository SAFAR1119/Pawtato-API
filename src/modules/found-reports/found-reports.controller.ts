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
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Found Reports')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('pets/:petId/found-reports')
export class FoundReportsController {
  constructor(private readonly foundReportsService: FoundReportsService) {}

  @ApiOperation({ summary: 'List found reports submitted for a pet' })
  @ApiParam({ name: 'petId', description: 'Pet ID' })
  @ApiResponse({
    status: 200,
    description: 'Array of found reports, newest first.',
  })
  @ApiResponse({
    status: 404,
    description:
      'Pet not found, or the caller has no access to it (not the owner and not an authorized caretaker).',
  })
  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,

    @Param('petId', ParseMongoIdPipe)
    petId: string,
  ) {
    return this.foundReportsService.findForOwnedPet(user.sub, petId);
  }
}
