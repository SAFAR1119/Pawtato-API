import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import * as fs from 'fs';

import { verifyPrivateFileToken } from './private-file-token.util';
import { resolvePrivateUploadPath } from './local-private-storage.util';

// No JwtAuthGuard here deliberately: access control for a private object is
// the signed token itself (short-lived, issued only by a caller who already
// passed a real authorization check — see IdentityVerificationService /
// DatingService.getNidExchange()), not a bearer token. This route only ever
// serves requests when STORAGE_PROVIDER=local; the S3 provider's
// getSignedUrl() returns a real presigned S3 URL and never points here.
@ApiTags('Storage')
@Controller('storage')
export class StorageController {
  constructor(private readonly configService: ConfigService) {}

  @ApiOperation({
    summary: 'Fetch a private object via a short-lived signed token',
    description:
      'No bearer auth — the token itself, minted server-side with a short expiry, is the ' +
      'authorization. Used for NID verification images; never a permanent link.',
  })
  @ApiParam({ name: 'token', description: 'Short-lived signed token' })
  @ApiResponse({ status: 200, description: 'The file bytes.' })
  @ApiResponse({
    status: 404,
    description: 'Token expired, invalid, or the file no longer exists.',
  })
  @Throttle({ public: { limit: 20, ttl: 60_000 } })
  @Get('private/:token')
  servePrivateFile(@Param('token') token: string, @Res() res: Response) {
    let key: string;

    try {
      key = verifyPrivateFileToken(
        this.configService.getOrThrow<string>('jwt.secret'),
        token,
      );
    } catch {
      throw new NotFoundException('This link has expired or is invalid');
    }

    const filePath = resolvePrivateUploadPath(key);

    if (!filePath || !fs.existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }

    res.sendFile(filePath);
  }
}
