import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

import { NotificationPriority } from '../enums/notification-priority.enum';

export type NotificationDocument = HydratedDocument<Notification>;

@Schema({ timestamps: true })
export class Notification {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  user!: Types.ObjectId;

  // Set only for pet-scoped events (scans, found reports, lost/found) — lets
  // resolveMissingContext() bulk-downgrade a pet's CRITICAL notifications the
  // moment it's reported found, without parsing the `data` payload.
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Pet',
    default: null,
    index: true,
  })
  pet?: Types.ObjectId | null;

  // One of the DOMAIN_EVENTS values (src/common/events/domain-events.ts) —
  // kept as a plain string rather than a Mongoose enum so new event types
  // don't require a schema migration.
  @Prop({ type: String, required: true })
  type!: string;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, trim: true })
  message!: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  data?: Record<string, unknown>;

  @Prop({ type: Date, default: null })
  readAt!: Date | null;

  // Drives auto-deletion by NotificationCleanupJob; see enums/notification-priority.enum.ts.
  @Prop({
    type: String,
    enum: Object.values(NotificationPriority),
    required: true,
    default: NotificationPriority.STANDARD,
  })
  priority!: NotificationPriority;

  // When set, the cleanup cron deletes this notification once past this time.
  // null means "never auto-delete" (CRITICAL priority) — only an explicit
  // user delete removes it.
  @Prop({ type: Date, default: null })
  expiresAt!: Date | null;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ user: 1, readAt: 1 });
NotificationSchema.index({ user: 1, pet: 1, priority: 1 });
NotificationSchema.index({ expiresAt: 1 });
// Backs NotificationQueryDto's `type` filter (e.g. a Matchup-section badge
// querying just `dating.match-created` notifications) combined with the
// existing unread filter, without a full per-user collection scan.
NotificationSchema.index({ user: 1, type: 1, readAt: 1 });
