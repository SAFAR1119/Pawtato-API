import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { DevicePlatform } from '../../../common/enums/device-platform.enum';

export type DeviceTokenDocument = HydratedDocument<DeviceToken>;

@Schema({
  timestamps: true,
})
export class DeviceToken {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId!: Types.ObjectId;

  // Opaque FCM/APNs-style push token — used for IOS/ANDROID once a native
  // app exists (still backlog; see PAWTATO_ROADMAP.md Phase 9). Not set for
  // WEB rows, which use `endpoint`/`p256dh`/`authSecret` instead — a real
  // browser PushSubscription has no single opaque token, so it can't share
  // this field. Unique-but-sparse: `sparse` means multiple documents with
  // no `token` at all (every WEB row) don't collide on Mongo's unique index,
  // same reasoning as the `endpoint` index below. A token that gets
  // re-registered under a different account moves rather than duplicates;
  // see NotificationsService.registerDeviceToken.
  @Prop({
    unique: true,
    sparse: true,
    index: true,
  })
  token?: string;

  // Real Web Push (VAPID) subscription fields — what a browser's
  // `PushManager.subscribe()` actually returns, per the Web Push protocol.
  // `endpoint` is the subscription's own unique identity (the push
  // service's per-device URL), so it plays the same "identity to upsert on"
  // role for WEB that `token` plays for native platforms.
  @Prop({
    unique: true,
    sparse: true,
    index: true,
  })
  endpoint?: string;

  @Prop()
  p256dh?: string;

  @Prop()
  authSecret?: string;

  @Prop({
    type: String,
    enum: DevicePlatform,
    required: true,
  })
  platform!: DevicePlatform;
}

export const DeviceTokenSchema = SchemaFactory.createForClass(DeviceToken);
