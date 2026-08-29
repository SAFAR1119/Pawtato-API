import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { DatingMode } from '../../../common/enums/dating-mode.enum';

export class DiscoverQueryDto {
  @ApiProperty({
    description: 'The caller-owned pet to find candidates for.',
  })
  @IsMongoId()
  petId!: string;

  @ApiProperty({
    enum: DatingMode,
    example: DatingMode.PLAYDATE,
    description:
      'Which pool to discover in. BREEDING candidates are always the same species as petId; ' +
      'PLAYDATE candidates are never species-restricted. petId must have this mode enabled on ' +
      'its own dating profile.',
  })
  @IsEnum(DatingMode)
  mode!: DatingMode;

  @ApiPropertyOptional({
    default: false,
    description:
      "Restrict candidates to owners who are identity-verified (APPROVED). Requires the caller's " +
      'own identity verification to also be APPROVED — a 400 otherwise.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  verifiedOnly?: boolean;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;
}
