import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { DatingMode } from '../../../common/enums/dating-mode.enum';

export class CreateDatingProfileDto {
  @ApiProperty({
    enum: DatingMode,
    isArray: true,
    example: [DatingMode.PLAYDATE],
    description:
      'Which mode(s) this pet is discoverable in — either or both. BREEDING candidates are ' +
      'always same-species; PLAYDATE candidates are never species-restricted.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(DatingMode, { each: true })
  modes!: DatingMode[];

  @ApiPropertyOptional({ example: 'Loves fetch and long walks in the park.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ example: ['playful', 'good-with-kids'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  temperamentTags?: string[];

  @ApiPropertyOptional({ example: ['fetch', 'belly rubs', 'the park'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  likes?: string[];

  @ApiPropertyOptional({ example: ['vacuum cleaners', 'baths'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  dislikes?: string[];

  @ApiProperty({
    description:
      'Already-hosted image URLs (e.g. from the same upload endpoint used for pet photos) — this ' +
      'module has no dedicated photo-upload endpoint of its own. At least one photo is required.',
    example: ['https://your-app.example/uploads/pets/photo1.png'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsUrl({}, { each: true })
  photos!: string[];

  @ApiPropertyOptional({
    example: 'Dhanmondi, Dhaka',
    description:
      'Coarse only — a city/area name or a lat/lng already rounded by the client. Never the precise address.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  approxLocation?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'All-or-nothing toggle: when true, profile reads include a medicalSummary computed live ' +
      "from this pet's real medical/vaccination records. When false, the summary is omitted entirely.",
  })
  @IsOptional()
  @IsBoolean()
  shareHealthSummary?: boolean;
}
