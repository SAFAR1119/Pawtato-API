import { ApiProperty } from '@nestjs/swagger';

export class DashboardStatsDto {
  @ApiProperty()
  totalUsers!: number;

  @ApiProperty()
  totalPets!: number;

  @ApiProperty()
  lostPets!: number;

  @ApiProperty()
  recoveredPets!: number;

  @ApiProperty()
  totalVaccinations!: number;

  @ApiProperty()
  totalMedicalRecords!: number;
}
