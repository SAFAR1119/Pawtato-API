import { IsMongoId, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignTagDto {
  @ApiProperty({
    example: 'PT8F2K91',
    description:
      "The tag's public code, printed on/near the physical QR sticker.",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  publicCode!: string;

  @ApiProperty({
    description: 'ID of the pet (owned by the caller) to assign this tag to.',
  })
  @IsMongoId()
  petId!: string;
}
