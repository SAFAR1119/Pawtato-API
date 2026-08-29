import { Controller, Get, Param, UseGuards } from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ScansService } from './scans.service';
import { ParseMongoIdPipe } from '../../common/pipes/parse-mongo-id.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Scans')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('pets/:petId/scans')
export class ScansController {
  constructor(private readonly scansService: ScansService) {}

  @ApiOperation({ summary: "List a pet's QR scan history" })
  @ApiParam({ name: 'petId', description: 'Pet ID' })
  @ApiResponse({
    status: 200,
    description: 'Array of scan events, newest first.',
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
    return this.scansService.findForOwnedPet(user.sub, petId);
  }
}
