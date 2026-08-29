import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UnassignTagDto {
  @ApiProperty({
    example: 'PT8F2K91',
    description:
      "The tag's public code, printed on/near the physical QR sticker.",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  publicCode!: string;
}
