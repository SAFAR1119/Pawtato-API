import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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

import { CaretakersService } from './caretakers.service';
import { AddCaretakerDto } from './dto/add-caretaker.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseMongoIdPipe } from '../../common/pipes/parse-mongo-id.pipe';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Caretakers')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('pets/:petId/caretakers')
export class CaretakersController {
  constructor(private readonly caretakersService: CaretakersService) {}

  @ApiOperation({
    summary: 'Grant another user shared (caretaker) access to a pet',
    description:
      'Owner-only. The target must already have a Pawtato account — there is no invite flow, ' +
      'access is granted immediately by email.',
  })
  @ApiParam({ name: 'petId', description: 'Pet ID' })
  @ApiResponse({ status: 201, description: 'Caretaker added.' })
  @ApiResponse({
    status: 400,
    description: 'Already a caretaker for this pet, or adding yourself.',
  })
  @ApiResponse({
    status: 404,
    description:
      'Pet not found or not owned by the caller, or no account exists with that email.',
  })
  @Post()
  add(
    @CurrentUser() user: JwtPayload,
    @Param('petId', ParseMongoIdPipe) petId: string,
    @Body() dto: AddCaretakerDto,
  ) {
    return this.caretakersService.add(user.sub, petId, dto);
  }

  @ApiOperation({
    summary: "List a pet's caretakers",
    description: 'Visible to the owner and to any existing caretaker.',
  })
  @ApiParam({ name: 'petId', description: 'Pet ID' })
  @ApiResponse({ status: 200, description: 'Array of caretakers.' })
  @ApiResponse({
    status: 404,
    description: 'Pet not found, or the caller has no access to it.',
  })
  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Param('petId', ParseMongoIdPipe) petId: string,
  ) {
    return this.caretakersService.list(user.sub, petId);
  }

  @ApiOperation({
    summary: 'Voluntarily leave as a caretaker for a pet',
    description:
      'Self-service — a caretaker can always revoke their own access without owner action.',
  })
  @ApiParam({ name: 'petId', description: 'Pet ID' })
  @ApiResponse({ status: 200, description: 'Access revoked.' })
  @ApiResponse({
    status: 404,
    description: 'The caller is not a caretaker for this pet.',
  })
  @Delete('me')
  leave(
    @CurrentUser() user: JwtPayload,
    @Param('petId', ParseMongoIdPipe) petId: string,
  ) {
    return this.caretakersService.leave(user.sub, petId);
  }

  @ApiOperation({
    summary: 'Remove a caretaker from a pet',
    description: 'Owner-only.',
  })
  @ApiParam({ name: 'petId', description: 'Pet ID' })
  @ApiParam({ name: 'caretakerId', description: 'Caretaker record ID' })
  @ApiResponse({ status: 200, description: 'Caretaker removed.' })
  @ApiResponse({
    status: 404,
    description:
      'Pet not found or not owned by the caller, or caretaker not found.',
  })
  @Delete(':caretakerId')
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('petId', ParseMongoIdPipe) petId: string,
    @Param('caretakerId', ParseMongoIdPipe) caretakerId: string,
  ) {
    return this.caretakersService.remove(user.sub, petId, caretakerId);
  }
}
