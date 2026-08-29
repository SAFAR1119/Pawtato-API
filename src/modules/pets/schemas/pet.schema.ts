import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { PetGender } from '../../../common/enums/pet-gender.enum';

export type PetDocument = HydratedDocument<Pet>;

@Schema({
  timestamps: true,
})
export class Pet {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  owner!: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
  })
  name!: string;

  @Prop({
    required: true,
  })
  species!: string;

  @Prop({
    default: '',
  })
  breed!: string;

  // Mandatory (Phase 12) — Breeding-mode dating match compatibility is
  // strictly opposite-gender, which is only enforceable if every pet has a
  // real, structured sex on file.
  @Prop({
    type: String,
    enum: PetGender,
    required: true,
  })
  gender!: PetGender;

  @Prop({
    default: '',
  })
  color!: string;

  @Prop()
  birthDate?: Date;

  @Prop()
  weight?: number;

  // One safety-relevant thing a stranger should know before approaching —
  // e.g. "Friendly but startles easily, approach calmly" or "May nip if
  // grabbed suddenly". Shown on the public scan profile.
  @Prop({
    trim: true,
    maxlength: 200,
  })
  notableTrait?: string;

  @Prop({
    default: '',
  })
  profileImage!: string;

  @Prop({
    default: false,
  })
  isLost!: boolean;

  @Prop()
  lostDate?: Date;

  @Prop()
  lastSeenLocation?: string;

  // Structured counterpart to lastSeenLocation (which stays free text for
  // display) — only set when the owner supplies coordinates on report-lost,
  // powers GET /public/lost-pets/nearby's geospatial search. GeoJSON Point,
  // [lng, lat] per the spec's coordinate order (see the 2dsphere index
  // below).
  @Prop({
    type: {
      type: String,
      enum: ['Point'],
    },
    coordinates: {
      type: [Number],
    },
  })
  lastSeenGeo?: {
    type: 'Point';
    coordinates: [number, number];
  };

  @Prop()
  lostDescription?: string;

  @Prop()
  reward?: number;

  @Prop()
  emergencyContact?: string;

  @Prop({
    default: 0,
  })
  scanCount!: number;

  @Prop()
  lastScannedAt?: Date;
}

export const PetSchema = SchemaFactory.createForClass(Pet);

// Backs PublicService.getLostPets() (`{ isLost: true }` sorted by `lostDate` desc)
// and the admin/statistics lost/recovered counters.
PetSchema.index({ isLost: 1, lostDate: -1 });

// Backs PublicService.getNearbyLostPets()'s $geoNear aggregation. A pet
// without lastSeenGeo is simply absent from a 2dsphere index (not indexed
// as "nowhere"), so this never affects pets reported lost with only a text
// location.
PetSchema.index({ lastSeenGeo: '2dsphere' });
