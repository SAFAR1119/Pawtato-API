import {
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDatingReportDto {
  @ApiProperty({ description: "The reported pet's dating profile." })
  @IsMongoId()
  targetPetId!: string;

  @ApiProperty({ example: 'Profile photos are of a different animal.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional({
    description:
      'Optional — set this when reporting from inside a chat (e.g. harassment in messages) so ' +
      'admin can review the actual conversation. The caller must own one side of the match, and ' +
      'targetPetId must be the other side.',
  })
  @IsOptional()
  @IsMongoId()
  matchId?: string;
}
