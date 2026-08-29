import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ShipTagOrderDto {
  @ApiProperty({ example: '1Z999AA10123456784' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  trackingNumber!: string;
}
