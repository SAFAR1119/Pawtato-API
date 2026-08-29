import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PetGender } from '../../../common/enums/pet-gender.enum';

export class CreatePetDto {
  @ApiProperty({ example: 'Milo' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'Cat', description: 'e.g. Cat, Dog' })
  @IsString()
  @MaxLength(100)
  species!: string;

  @ApiPropertyOptional({ example: 'Persian' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  breed?: string;

  @ApiProperty({
    enum: PetGender,
    example: PetGender.MALE,
    description:
      'Required — Breeding-mode dating match compatibility is strictly opposite-gender, which ' +
      "depends on every pet's sex being on file from creation.",
  })
  @IsEnum(PetGender)
  gender!: PetGender;

  @ApiPropertyOptional({ example: 'White' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  color?: string;

  @ApiPropertyOptional({ example: '2022-05-01' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ example: 4.2, description: 'Weight in kilograms' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  weight?: number;

  @ApiPropertyOptional({
    example: 'Friendly but startles easily — approach calmly.',
    description:
      'One safety-relevant trait a stranger should know before approaching. Shown on the public scan profile.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  notableTrait?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isLost?: boolean;
}
