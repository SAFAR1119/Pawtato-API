import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { FoundReportStatus } from '../../../common/enums/found-report-status.enum';

export class AdminFoundReportQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;

  @ApiPropertyOptional({ enum: FoundReportStatus })
  @IsOptional()
  @IsEnum(FoundReportStatus)
  status?: FoundReportStatus;

  @ApiPropertyOptional({
    description:
      'Filter to reports sharing a device fingerprint — useful for spotting one device farming reports across many tags.',
  })
  @IsOptional()
  @IsString()
  deviceFingerprint?: string;
}
