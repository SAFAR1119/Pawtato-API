import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { IdentityVerificationStatus } from '../../../common/enums/identity-verification-status.enum';

export class AdminIdentityVerificationQueryDto {
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

  @ApiPropertyOptional({
    enum: IdentityVerificationStatus,
    default: IdentityVerificationStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(IdentityVerificationStatus)
  status?: IdentityVerificationStatus;
}
