import { ApiProperty } from '@nestjs/swagger';

class SpeciesDistributionItem {
  @ApiProperty()
  species!: string;

  @ApiProperty()
  count!: number;
}

class LostVsRecovered {
  @ApiProperty()
  lost!: number;

  @ApiProperty()
  recovered!: number;
}

class TopScannedPet {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  scanCount!: number;
}

export class DashboardAnalyticsDto {
  @ApiProperty({ type: [Number] })
  monthlyUsers!: number[];

  @ApiProperty({ type: [Number] })
  monthlyPets!: number[];

  @ApiProperty({ type: [Number] })
  monthlyQrScans!: number[];

  @ApiProperty({ type: [SpeciesDistributionItem] })
  speciesDistribution!: SpeciesDistributionItem[];

  @ApiProperty({ type: LostVsRecovered })
  lostVsRecovered!: LostVsRecovered;

  @ApiProperty({ type: [TopScannedPet] })
  topScannedPets!: TopScannedPet[];
}
