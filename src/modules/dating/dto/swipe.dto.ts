import { IsEnum, IsMongoId } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { SwipeAction } from '../../../common/enums/swipe-action.enum';
import { DatingMode } from '../../../common/enums/dating-mode.enum';

export class SwipeDto {
  @ApiProperty({ description: 'The caller-owned pet doing the swiping.' })
  @IsMongoId()
  fromPetId!: string;

  @ApiProperty({ description: 'The pet being swiped on.' })
  @IsMongoId()
  toPetId!: string;

  @ApiProperty({ enum: SwipeAction, example: SwipeAction.LIKE })
  @IsEnum(SwipeAction)
  action!: SwipeAction;

  @ApiProperty({
    enum: DatingMode,
    example: DatingMode.PLAYDATE,
    description:
      'Which pool this swipe happened in — must match the mode used in the discover() call that ' +
      'surfaced this candidate. Re-validated server-side (species/mode-enabled), not trusted blindly.',
  })
  @IsEnum(DatingMode)
  mode!: DatingMode;
}
