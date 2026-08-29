import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ParseOptionalBoolean } from '../../../common/decorators/parse-optional-boolean.decorator';

export class NotificationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Return only unread notifications' })
  @ParseOptionalBoolean()
  unreadOnly?: boolean;

  @ApiPropertyOptional({
    description:
      'Restrict to a single notification type (one of the DOMAIN_EVENTS values, e.g. ' +
      '"dating.match-created") — lets a specific UI surface (e.g. the Matchup section\'s ' +
      'new-match indicator) query just its own notifications instead of the full list.',
    example: 'dating.match-created',
  })
  @IsOptional()
  @IsString()
  type?: string;
}
