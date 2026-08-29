import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';

import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PetsService } from './pets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseMongoIdPipe } from '../../common/pipes/parse-mongo-id.pipe';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { ReportLostDto } from './dto/report-lost.dto';
import {
  imageFileFilter,
  MAX_IMAGE_SIZE_BYTES,
  STORAGE_PROVIDER,
} from '../storage/storage.constants';
import type { StorageProvider } from '../storage/interfaces/storage-provider.interface';

@ApiTags('Pets')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('pets')
export class PetsController {
  constructor(
    private readonly petsService: PetsService,

    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  @ApiOperation({ summary: "List the current user's pets" })
  @ApiResponse({
    status: 200,
    description: 'Array of pets owned by the caller.',
  })
  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.petsService.findAll(user.sub);
  }

  @ApiOperation({ summary: 'Create a new pet' })
  @ApiResponse({ status: 201, description: 'Pet created.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() createPetDto: CreatePetDto) {
    return this.petsService.create(user.sub, createPetDto);
  }

  @ApiOperation({ summary: "Get statistics for the current user's pets" })
  @ApiResponse({
    status: 200,
    description: 'Aggregate pet statistics for the caller.',
  })
  @Get('statistics')
  getStatistics(@CurrentUser() user: JwtPayload) {
    return this.petsService.getStatistics(user.sub);
  }

  @ApiOperation({
    summary: 'Get a single pet the current user owns or is a caretaker for',
    description:
      "Accessible to the pet's owner and to any authorized caretaker (see " +
      'POST /pets/:petId/caretakers), not just the owner.',
  })
  @ApiParam({ name: 'id', description: 'Pet ID' })
  @ApiResponse({ status: 200, description: 'The pet.' })
  @ApiResponse({
    status: 404,
    description: 'Pet not found, or the caller has no access to it.',
  })
  @Get(':id')
  findOne(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    petId: string,
  ) {
    return this.petsService.findOne(user.sub, petId);
  }

  @ApiOperation({ summary: 'Update a pet owned by the current user' })
  @ApiParam({ name: 'id', description: 'Pet ID' })
  @ApiResponse({ status: 200, description: 'The updated pet.' })
  @ApiResponse({
    status: 404,
    description: 'Pet not found or not owned by the caller.',
  })
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    petId: string,

    @Body()
    updatePetDto: UpdatePetDto,
  ) {
    return this.petsService.update(user.sub, petId, updatePetDto);
  }

  @ApiOperation({ summary: "Upload a pet's profile photo" })
  @ApiParam({ name: 'id', description: 'Pet ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, description: 'Photo uploaded.' })
  @ApiResponse({
    status: 404,
    description: 'Pet not found or not owned by the caller.',
  })
  @Post(':id/photo')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
      fileFilter: imageFileFilter,
    }),
  )
  async uploadPhoto(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    petId: string,

    @UploadedFile()
    file: Express.Multer.File,
  ) {
    const key = await this.storageProvider.upload({
      buffer: file.buffer,
      folder: 'pets',
      originalName: file.originalname,
      mimetype: file.mimetype,
    });

    const pet = await this.petsService.updatePhoto(
      user.sub,
      petId,
      this.storageProvider.getUrl(key),
    );

    return {
      message: 'Photo uploaded successfully',
      profileImage: pet.profileImage,
    };
  }

  @ApiOperation({ summary: "Remove a pet's profile photo" })
  @ApiParam({ name: 'id', description: 'Pet ID' })
  @ApiResponse({ status: 200, description: 'Photo removed.' })
  @ApiResponse({
    status: 404,
    description: 'Pet not found or not owned by the caller.',
  })
  @Delete(':id/photo')
  removePhoto(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    petId: string,
  ) {
    return this.petsService.removePhoto(user.sub, petId);
  }

  @ApiOperation({ summary: 'Delete a pet owned by the current user' })
  @ApiParam({ name: 'id', description: 'Pet ID' })
  @ApiResponse({ status: 200, description: 'Pet deleted.' })
  @ApiResponse({
    status: 404,
    description: 'Pet not found or not owned by the caller.',
  })
  @Delete(':id')
  remove(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    petId: string,
  ) {
    return this.petsService.remove(user.sub, petId);
  }

  @ApiOperation({
    summary: 'Mark a pet as lost',
    description:
      'Callable by the owner or an authorized caretaker (e.g. a pet-sitter reporting an ' +
      'escape). The owner is always the one notified, regardless of who reports it.',
  })
  @ApiParam({ name: 'id', description: 'Pet ID' })
  @ApiResponse({ status: 200, description: 'Pet marked as lost.' })
  @ApiResponse({
    status: 404,
    description: 'Pet not found, or the caller has no access to it.',
  })
  @Patch(':id/report-lost')
  reportLost(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    petId: string,

    @Body()
    dto: ReportLostDto,
  ) {
    return this.petsService.reportLost(user.sub, petId, dto);
  }

  @ApiOperation({
    summary: 'Mark a pet as found/recovered',
    description: 'Callable by the owner or an authorized caretaker.',
  })
  @ApiParam({ name: 'id', description: 'Pet ID' })
  @ApiResponse({ status: 200, description: 'Pet marked as found.' })
  @ApiResponse({
    status: 404,
    description: 'Pet not found, or the caller has no access to it.',
  })
  @Patch(':id/report-found')
  reportFound(
    @CurrentUser() user: JwtPayload,

    @Param('id', ParseMongoIdPipe)
    petId: string,
  ) {
    return this.petsService.reportFound(user.sub, petId);
  }
}
