import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { TagOrderStatus } from '../../../common/enums/tag-order-status.enum';

export type TagOrderDocument = HydratedDocument<TagOrder>;

@Schema({ _id: false })
export class ShippingAddress {
  @Prop({ required: true, trim: true, maxlength: 200 })
  fullName!: string;

  @Prop({ required: true, trim: true, maxlength: 200 })
  line1!: string;

  @Prop({ trim: true, maxlength: 200 })
  line2?: string;

  @Prop({ required: true, trim: true, maxlength: 100 })
  city!: string;

  @Prop({ required: true, trim: true, maxlength: 100 })
  state!: string;

  @Prop({ required: true, trim: true, maxlength: 20 })
  postalCode!: string;

  @Prop({ required: true, trim: true, maxlength: 100 })
  country!: string;
}

export const ShippingAddressSchema =
  SchemaFactory.createForClass(ShippingAddress);

@Schema({
  timestamps: true,
})
export class TagOrder {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId!: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  quantity!: number;

  @Prop({ required: true })
  unitPriceCents!: number;

  @Prop({ required: true })
  totalAmountCents!: number;

  @Prop({ required: true })
  currency!: string;

  @Prop({ type: ShippingAddressSchema, required: true })
  shippingAddress!: ShippingAddress;

  @Prop({
    type: String,
    enum: TagOrderStatus,
    default: TagOrderStatus.PENDING_PAYMENT,
    index: true,
  })
  status!: TagOrderStatus;

  @Prop({ required: true, unique: true })
  stripeCheckoutSessionId!: string;

  @Prop()
  stripePaymentIntentId?: string;

  @Prop()
  paidAt?: Date;

  @Prop()
  fulfilledAt?: Date;

  @Prop()
  trackingNumber?: string;
}

export const TagOrderSchema = SchemaFactory.createForClass(TagOrder);
