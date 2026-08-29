import { IsInt, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

import { ShippingAddressDto } from './shipping-address.dto';

export class CreateTagOrderDto {
  @ApiProperty({
    example: 5,
    minimum: 1,
    maximum: 100,
    description: 'How many physical QR tags to order.',
  })
  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;

  @ApiProperty({ type: ShippingAddressDto })
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress!: ShippingAddressDto;
}
