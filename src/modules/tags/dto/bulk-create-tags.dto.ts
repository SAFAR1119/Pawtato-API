import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BulkCreateTagsDto {
  @ApiProperty({
    example: 50,
    minimum: 1,
    maximum: 500,
    description: 'How many tags to manufacture in this batch.',
  })
  @IsInt()
  @Min(1)
  @Max(500)
  count!: number;

  @ApiProperty({
    example: 'https://pawtato.ariyan.app/qr/',
    description:
      "The frontend's QR-landing route, everything up to (not including) the code — " +
      'the same base URL every tag in this batch will be printed with.',
  })
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  @MaxLength(500)
  redirectBaseUrl!: string;

  @ApiPropertyOptional({
    example: '2026-08 print run #3',
    description: 'Free-text note identifying this manufacturing batch.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  batchLabel?: string;
}
