import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { CreateDatingProfileDto } from './create-dating-profile.dto';

export class UpdateDatingProfileDto extends PartialType(
  CreateDatingProfileDto,
) {
  @ApiPropertyOptional({
    description: 'Pause (false) or resume (true) visibility in discovery.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
