import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { DatingService } from './dating.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseMongoIdPipe } from '../../common/pipes/parse-mongo-id.pipe';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateDatingProfileDto } from './dto/create-dating-profile.dto';
import { UpdateDatingProfileDto } from './dto/update-dating-profile.dto';

@ApiTags('Dating')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('pets/:petId/dating-profile')
export class PetDatingProfileController {
  constructor(private readonly datingService: DatingService) {}

  @ApiOperation({ summary: "Create a pet's dating profile" })
  @ApiParam({ name: 'petId', description: 'Pet ID' })
  @ApiResponse({ status: 201, description: 'Dating profile created.' })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed, species is not a cat/dog, or a profile already exists for this pet.',
  })
  @ApiResponse({
    status: 404,
    description: 'Pet not found or not owned by the caller.',
  })
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Param('petId', ParseMongoIdPipe) petId: string,
    @Body() dto: CreateDatingProfileDto,
  ) {
    return this.datingService.createProfile(user.sub, petId, dto);
  }

  @ApiOperation({ summary: "Update a pet's dating profile" })
  @ApiParam({ name: 'petId', description: 'Pet ID' })
  @ApiResponse({ status: 200, description: 'Dating profile updated.' })
  @ApiResponse({ status: 404, description: 'Pet or dating profile not found.' })
  @Patch()
  update(
    @CurrentUser() user: JwtPayload,
    @Param('petId', ParseMongoIdPipe) petId: string,
    @Body() dto: UpdateDatingProfileDto,
  ) {
    return this.datingService.updateProfile(user.sub, petId, dto);
  }

  @ApiOperation({
    summary: "Verify a pet's health records for BREEDING visibility",
    description:
      'Sets `healthVerified: true` only after confirming the pet already has at least one ' +
      'medical record and one vaccination record — never settable directly via create/update.',
  })
  @ApiParam({ name: 'petId', description: 'Pet ID' })
  @ApiResponse({
    status: 200,
    description: 'Dating profile marked health-verified.',
  })
  @ApiResponse({
    status: 400,
    description:
      "Profile doesn't have BREEDING enabled, or the pet is missing a medical/vaccination record.",
  })
  @ApiResponse({ status: 404, description: 'Pet or dating profile not found.' })
  @Patch('verify-health')
  verifyHealth(
    @CurrentUser() user: JwtPayload,
    @Param('petId', ParseMongoIdPipe) petId: string,
  ) {
    return this.datingService.verifyHealth(user.sub, petId);
  }
}
