import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';

import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';

import { PublicService } from './public.service';
import { CreateFoundReportDto } from '../found-reports/dto/create-found-report.dto';
import { NearbyLostPetsQueryDto } from './dto/nearby-lost-pets-query.dto';
import {
  imageFileFilter,
  MAX_IMAGE_SIZE_BYTES,
  STORAGE_PROVIDER,
} from '../storage/storage.constants';
import type { StorageProvider } from '../storage/interfaces/storage-provider.interface';

@ApiTags('Public')
@Controller('public')
export class PublicController {
  constructor(
    private readonly publicService: PublicService,

    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  @ApiOperation({
    summary: "Get a pet's public profile by its tag's public code",
    description:
      'No authentication required. This is the page a QR-code scan resolves to. ' +
      'If the tag is not currently linked to a pet (unclaimed manufactured inventory, ' +
      'claimed but never assigned, or suspended/retired), returns a status message instead ' +
      'of a pet profile — branch on `tagStatus` (`MANUFACTURED` | `AVAILABLE` | `ASSIGNED` | ' +
      '`SUSPENDED` | `RETIRED`), not on HTTP status. Never returns owner-private information ' +
      '(password, internal IDs, unshared contact details).',
  })
  @ApiResponse({
    status: 200,
    description: 'Public pet profile, or a tag-status message.',
  })
  @ApiResponse({
    status: 404,
    description: 'No tag found for this public code.',
  })
  @Throttle({ public: { limit: 20, ttl: 60_000 } })
  @Get('tags/:publicCode')
  getPetProfile(
    @Param('publicCode')
    publicCode: string,

    @Headers('user-agent')
    userAgent?: string,
  ) {
    return this.publicService.getPetProfile(publicCode, userAgent);
  }

  @ApiOperation({
    summary: 'List pets currently reported lost',
    description: 'No authentication required.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of lost pets with public-safe fields only.',
  })
  @Throttle({ public: { limit: 20, ttl: 60_000 } })
  @Get('lost-pets')
  getLostPets() {
    return this.publicService.getLostPets();
  }

  @ApiOperation({
    summary: 'List pets reported lost near a given point',
    description:
      'No authentication required. Only pets whose owner supplied coordinates on report-lost ' +
      '(the `lat`/`lng` fields are optional) are searchable this way — a pet reported lost with ' +
      'only a text location will still appear in GET /public/lost-pets but not here.',
  })
  @ApiResponse({
    status: 200,
    description:
      'List of lost pets within the given radius, nearest first, with public-safe fields only.',
  })
  @Throttle({ public: { limit: 20, ttl: 60_000 } })
  @Get('lost-pets/nearby')
  getNearbyLostPets(
    @Query()
    query: NearbyLostPetsQueryDto,
  ) {
    return this.publicService.getNearbyLostPets(query);
  }

  @ApiOperation({
    summary: "Report a found pet by its tag's public code",
    description:
      'No authentication required. Lets a finder notify the owner without creating an account.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        approxLocation: { type: 'string' },
        contactInfo: { type: 'string' },
        deviceFingerprint: {
          type: 'string',
          description:
            'Opaque client-generated id (e.g. a UUID persisted in localStorage) — required, used for spam rate-limiting.',
        },
        photo: { type: 'string', format: 'binary' },
      },
      required: ['message', 'deviceFingerprint'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Found report submitted; the owner is notified.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed, or the tag is not linked to a pet.',
  })
  @ApiResponse({
    status: 404,
    description: 'No tag found for this public code.',
  })
  @ApiResponse({
    status: 429,
    description:
      'Too many reports from this device (same-tag cooldown or overall rate cap).',
  })
  @Throttle({ write: { limit: 5, ttl: 60_000 } })
  @Post('tags/:publicCode/found-report')
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
      fileFilter: imageFileFilter,
    }),
  )
  async submitFoundReport(
    @Param('publicCode')
    publicCode: string,

    @Body()
    dto: CreateFoundReportDto,

    @UploadedFile()
    file?: Express.Multer.File,
  ) {
    let photoUrl: string | undefined;

    if (file) {
      const key = await this.storageProvider.upload({
        buffer: file.buffer,
        folder: 'found-reports',
        originalName: file.originalname,
        mimetype: file.mimetype,
      });

      photoUrl = this.storageProvider.getUrl(key);
    }

    return this.publicService.submitFoundReport(publicCode, dto, photoUrl);
  }
}
