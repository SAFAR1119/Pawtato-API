import { IsEmail, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'sarah@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
