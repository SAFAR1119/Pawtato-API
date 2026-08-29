import { IsMongoId, IsOptional, IsInt, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ActivityQueryDto {
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

  @ApiPropertyOptional({
    description: 'Filter to entries by this actor (user ID)',
  })
  @IsOptional()
  @IsMongoId()
  actor?: string;

  @ApiPropertyOptional({
    description: 'Filter to a specific action, e.g. "admin.user.blocked"',
    example: 'tag.suspended',
  })
  @IsOptional()
  @IsString()
  action?: string;
}
