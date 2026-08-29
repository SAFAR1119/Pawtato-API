import {
  BadRequestException,
  Controller,
  Get,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { IdentityVerificationService } from './identity-verification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  imageFileFilter,
  MAX_IMAGE_SIZE_BYTES,
} from '../storage/storage.constants';

@ApiTags('Dating')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('dating/verification')
export class IdentityVerificationController {
  constructor(
    private readonly identityVerificationService: IdentityVerificationService,
  ) {}

  @ApiOperation({
    summary: "Submit (or resubmit) the caller's identity verification",
    description:
      'Verifies the owner, not any single pet — one verification per account. NID images are ' +
      'stored privately and never returned by any read endpoint as a direct URL. Resubmitting ' +
      'after a REJECTED status resets to PENDING and deletes the old images; resubmitting while ' +
      'APPROVED is rejected (contact support instead).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        front: { type: 'string', format: 'binary' },
        back: { type: 'string', format: 'binary' },
      },
      required: ['front', 'back'],
    },
  })
  @ApiResponse({ status: 201, description: 'Submitted for admin review.' })
  @ApiResponse({
    status: 400,
    description: 'Missing an image, or already APPROVED.',
  })
  @Throttle({ write: { limit: 5, ttl: 60_000 } })
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'front', maxCount: 1 },
        { name: 'back', maxCount: 1 },
      ],
      {
        limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
        fileFilter: imageFileFilter,
      },
    ),
  )
  async submit(
    @CurrentUser() user: JwtPayload,
    @UploadedFiles()
    files: {
      front?: Express.Multer.File[];
      back?: Express.Multer.File[];
    },
  ) {
    const front = files.front?.[0];
    const back = files.back?.[0];

    if (!front || !back) {
      throw new BadRequestException('Both front and back images are required');
    }

    const verification = await this.identityVerificationService.submit(
      user.sub,
      front,
      back,
    );

    return {
      message: 'Submitted for review.',
      status: verification.status,
    };
  }

  @ApiOperation({
    summary: "Get the caller's own identity verification status",
  })
  @ApiResponse({
    status: 200,
    description:
      'status is null if nothing has ever been submitted. rejectionReason is present only when REJECTED.',
  })
  @Get('me')
  getMyStatus(@CurrentUser() user: JwtPayload) {
    return this.identityVerificationService.getMyStatus(user.sub);
  }
}
