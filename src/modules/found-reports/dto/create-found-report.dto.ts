import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFoundReportDto {
  @ApiProperty({
    example: 'Found near Road 27, looks healthy and friendly.',
    description: 'A message from the finder to the owner.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message!: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description:
      'An opaque identifier generated and persisted client-side (e.g. a UUID kept in ' +
      'localStorage), sent with every found-report submission from this browser/device. ' +
      'Used only for spam/abuse rate-limiting on this anonymous, no-auth endpoint — not tied ' +
      'to any account.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(256)
  deviceFingerprint!: string;

  @ApiPropertyOptional({ example: 'Dhanmondi, Dhaka' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  approxLocation?: string;

  @ApiPropertyOptional({
    example: '+8801XXXXXXXXX',
    description: 'Optional way for the owner to reach the finder back.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactInfo?: string;
}
