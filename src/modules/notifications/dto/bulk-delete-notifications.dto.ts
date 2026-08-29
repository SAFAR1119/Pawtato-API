import { ArrayNotEmpty, IsArray, IsMongoId } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkDeleteNotificationsDto {
  @ApiProperty({
    type: [String],
    description: 'Notification IDs to delete',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  ids!: string[];
}
