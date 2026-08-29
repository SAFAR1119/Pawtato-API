import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { DatingReportStatus } from '../../../common/enums/dating-report-status.enum';

export class UpdateDatingReportStatusDto {
  @ApiProperty({
    enum: DatingReportStatus,
    example: DatingReportStatus.REVIEWED,
    description:
      'REVIEWED — looked at, no action needed. ACTIONED — the reported profile was deactivated ' +
      '(pair with PATCH /admin/dating/profiles/{petId}/deactivate).',
  })
  @IsEnum(DatingReportStatus)
  status!: DatingReportStatus;
}
