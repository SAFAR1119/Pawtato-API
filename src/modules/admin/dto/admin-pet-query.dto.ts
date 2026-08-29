import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ParseOptionalBoolean } from '../../../common/decorators/parse-optional-boolean.decorator';

export class AdminPetQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit = 10;

  @ApiPropertyOptional({ description: 'Search by pet name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @ParseOptionalBoolean()
  isLost?: boolean;

  @ApiPropertyOptional({ example: 'Cat' })
  @IsOptional()
  @IsString()
  species?: string;

  @ApiPropertyOptional({ default: 'createdAt' })
  @IsOptional()
  @IsString()
  sort = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';
}
