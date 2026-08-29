import { Controller, Get, UseGuards } from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CaretakersService } from './caretakers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

// A second controller for the same underlying resource (PetCaretaker) at a
// different, non-pet-scoped path — mirrors the found-reports module's
// FoundReportsController/TagFoundReportsController split for the same
// reason: this route isn't scoped under a single :petId, it lists across
// every pet the caller has access to.
@ApiTags('Caretakers')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('caretaking/pets')
export class MyCaretakingController {
  constructor(private readonly caretakersService: CaretakersService) {}

  @ApiOperation({
    summary: 'List every pet the current user has caretaker access to',
    description:
      'Distinct from GET /pets, which only ever lists pets the caller owns — this is how a ' +
      'caretaker discovers which pets they can act on.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Array of caretaker grants, each with the pet and who granted access.',
  })
  @Get()
  listMyCaretakingPets(@CurrentUser() user: JwtPayload) {
    return this.caretakersService.listPetsForCaretaker(user.sub);
  }
}
