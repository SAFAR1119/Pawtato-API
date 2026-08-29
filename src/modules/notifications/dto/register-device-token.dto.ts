import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { DevicePlatform } from '../../../common/enums/device-platform.enum';

export class RegisterDeviceTokenDto {
  @ApiProperty({
    example: 'cXy1z...fcm-or-apns-token',
    description: 'Opaque push token issued by FCM/APNs/the browser.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token!: string;

  @ApiProperty({ enum: DevicePlatform, example: DevicePlatform.ANDROID })
  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;
}
