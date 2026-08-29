import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, IsUrl, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Deliberately shaped to match PushSubscription.toJSON() exactly, so the
// frontend can POST the browser's own subscription object with no
// transformation: `fetch(..., { body: JSON.stringify(subscription) })`.
export class WebPushSubscriptionKeysDto {
  @ApiProperty({ description: "The subscription's P-256 ECDH public key." })
  @IsString()
  @IsNotEmpty()
  p256dh!: string;

  @ApiProperty({ description: "The subscription's auth secret." })
  @IsString()
  @IsNotEmpty()
  auth!: string;
}

export class RegisterWebPushSubscriptionDto {
  @ApiProperty({
    description:
      "The push service URL PushChannel sends encrypted messages to — this subscription's unique identity.",
  })
  @IsUrl()
  endpoint!: string;

  @ApiProperty({ type: WebPushSubscriptionKeysDto })
  @ValidateNested()
  @Type(() => WebPushSubscriptionKeysDto)
  keys!: WebPushSubscriptionKeysDto;
}
