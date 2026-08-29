import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMedicalRecordDto {
  @ApiProperty({ example: 'Annual checkup' })
  @IsString()
  @MaxLength(150)
  title!: string;

  @ApiPropertyOptional({ example: 'Mild ear infection' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  diagnosis?: string;

  @ApiPropertyOptional({ example: 'Prescribed ear drops for 7 days' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  treatment?: string;

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

  @ApiPropertyOptional({ example: '2026-01-15' })
  @IsOptional()
  @IsDateString()
  visitDate?: Date;

  @ApiPropertyOptional({ example: 'Follow up in two weeks.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
