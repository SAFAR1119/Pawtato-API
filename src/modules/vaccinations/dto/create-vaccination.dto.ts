import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateVaccinationDto {
  @ApiProperty({ example: 'Rabies' })
  @IsString()
  @MaxLength(150)
  vaccineName!: string;

  @ApiProperty({ example: '2026-01-15' })
  @IsDateString()
  administeredDate!: Date;

  @ApiProperty({ example: '2027-01-15' })
  @IsDateString()
  nextDueDate!: Date;

  @ApiPropertyOptional({ example: 'Dr. Rahman' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  veterinarian?: string;

  @ApiPropertyOptional({ example: 'City Vet Clinic' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  clinic?: string;

  @ApiPropertyOptional({ example: 'No adverse reaction observed.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
