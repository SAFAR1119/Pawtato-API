import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReportLostDto {
  @ApiProperty({ example: 'Dhanmondi, Dhaka' })
  @IsString()
  @MaxLength(200)
  lastSeenLocation!: string;

  @ApiProperty({ example: 'Last seen near Road 27, wearing a red collar.' })
  @IsString()
  @MaxLength(1000)
  lostDescription!: string;

  @ApiProperty({ example: '+8801XXXXXXXXX' })
  @IsString()
  @MaxLength(50)
  emergencyContact!: string;

  @ApiPropertyOptional({ example: 50, description: 'Optional reward amount' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  reward?: number;

  @ApiPropertyOptional({
    example: 23.7461,
    description:
      'Optional latitude of the last-seen location, powers nearby lost-pet search. ' +
      'Omit if you only have a text description.',
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({
    example: 90.3742,
    description: 'Optional longitude of the last-seen location.',
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;
}
