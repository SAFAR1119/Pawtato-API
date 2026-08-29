import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ClaimTagDto {
  @ApiProperty({
    example: 'PT8F2K91',
    description:
      "The tag's public code, printed on/near the physical QR sticker — " +
      'must belong to an unclaimed, admin-manufactured batch.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  publicCode!: string;
}
