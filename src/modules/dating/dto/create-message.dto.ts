import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMessageDto {
  @ApiProperty({ example: 'Hi! Milo would love a playdate this weekend.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;
}
