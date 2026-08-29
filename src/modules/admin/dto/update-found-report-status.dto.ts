import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { FoundReportStatus } from '../../../common/enums/found-report-status.enum';

export class UpdateFoundReportStatusDto {
  @ApiProperty({
    enum: FoundReportStatus,
    example: FoundReportStatus.DISMISSED,
    description:
      'REVIEWED — looked at, legitimate. DISMISSED — spam/not credible, no action taken. ' +
      'ACTIONED — spam/malicious and something was done about it (e.g. the tag was separately suspended).',
  })
  @IsEnum(FoundReportStatus)
  status!: FoundReportStatus;
}
