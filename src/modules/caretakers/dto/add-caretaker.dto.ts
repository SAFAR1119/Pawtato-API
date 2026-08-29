import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddCaretakerDto {
  @ApiProperty({
    example: 'caretaker@example.com',
    description:
      "The email of the caretaker's existing Pawtato account. There is no invite flow — " +
      'the account must already exist, and access is granted immediately.',
  })
  @IsEmail()
  email!: string;
}
