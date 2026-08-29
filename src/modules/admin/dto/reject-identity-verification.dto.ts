import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectIdentityVerificationDto {
  @ApiProperty({
    example: 'Back image is blurry — please retake.',
    description:
      'Shown verbatim to the user on their verification status screen.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  reason!: string;
}
