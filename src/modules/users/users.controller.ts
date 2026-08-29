import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Patch,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Post, UploadedFile, UseInterceptors } from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';

import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import {
  imageFileFilter,
  MAX_IMAGE_SIZE_BYTES,
  STORAGE_PROVIDER,
} from '../storage/storage.constants';
import type { StorageProvider } from '../storage/interfaces/storage-provider.interface';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,

    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  @ApiOperation({ summary: "Get the current user's profile" })
  @ApiResponse({ status: 200, description: 'The user profile.' })
  @Get('profile')
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.usersService.getProfile(user.sub);
  }

  @ApiOperation({ summary: "Update the current user's profile" })
  @ApiResponse({ status: 200, description: 'The updated profile.' })
  @Patch('profile')
  updateProfile(
    @CurrentUser() user: JwtPayload,

    @Body()
    updateProfileDto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.sub, updateProfileDto);
  }

  @ApiOperation({ summary: "Upload the current user's avatar image" })
  @ApiResponse({ status: 201, description: 'Avatar uploaded.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
      fileFilter: imageFileFilter,
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const key = await this.storageProvider.upload({
      buffer: file.buffer,
      folder: 'avatars',
      originalName: file.originalname,
      mimetype: file.mimetype,
    });

    const updatedUser = await this.usersService.updateAvatar(
      user.sub,
      this.storageProvider.getUrl(key),
    );

    return {
      message: 'Avatar uploaded successfully',
      avatar: updatedUser?.avatar,
    };
  }

  @ApiOperation({ summary: "Remove the current user's avatar image" })
  @ApiResponse({ status: 200, description: 'Avatar removed.' })
  @Delete('avatar')
  removeAvatar(@CurrentUser() user: JwtPayload) {
    return this.usersService.removeAvatar(user.sub);
  }
}
