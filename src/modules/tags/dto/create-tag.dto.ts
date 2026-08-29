import { IsNotEmpty, IsUrl, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTagDto {
  @ApiProperty({
    example: 'https://pawtato.ariyan.app/qr/',
    description:
      "The frontend's QR-landing route, everything up to (not including) the code — " +
      "e.g. https://pawtato.ariyan.app/qr/. The backend generates the tag's public code " +
      'and appends it to build the full link that gets encoded into the QR image ' +
      '(e.g. https://pawtato.ariyan.app/qr/ASDOPW).',
  })
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  @MaxLength(500)
  redirectBaseUrl!: string;
}
