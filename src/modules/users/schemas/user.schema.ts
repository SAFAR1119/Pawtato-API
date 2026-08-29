import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { UserRole } from '../../../common/enums/user-role.enum';
import { AccountStatus } from '../../../common/enums/account-status.enum';

export type UserDocument = HydratedDocument<User>;

@Schema({
  timestamps: true,
})
export class User {
  @Prop({
    required: true,
    trim: true,
  })
  fullName!: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  })
  email!: string;

  @Prop({
    required: true,
    select: false,
  })
  password!: string;

  @Prop({
    default: '',
  })
  phone!: string;

  @Prop({
    default: '',
  })
  address!: string;

  @Prop({
    default: '',
  })
  avatar!: string;

  @Prop({
    type: String,
    default: UserRole.USER,
    enum: UserRole,
  })
  role!: UserRole;

  @Prop({
    default: true,
  })
  isActive!: boolean;

  // The single authoritative source of truth for the email-verification
  // lifecycle (see AccountStatus) — deliberately not a boolean, so there's
  // never a way for "pending" and "verified" to both/neither be true.
  @Prop({
    type: String,
    default: AccountStatus.PENDING_VERIFICATION,
    enum: AccountStatus,
    index: true,
  })
  status!: AccountStatus;

  // SHA-256 hash of the emailed OTP (not bcrypt — this needs a fast,
  // deterministic comparison against a single active code per user, not a
  // per-guess-salted password check). Only one OTP is ever active per user;
  // issuing a new one overwrites these fields, which is what makes the
  // previous code stop working.
  @Prop({
    select: false,
  })
  otpHash?: string;

  @Prop()
  otpExpiresAt?: Date;

  // Failed verification attempts against the *current* otpHash. Reset to 0
  // whenever a new OTP is issued; once it reaches the configured max, the
  // OTP is invalidated and the user must request a new one (see
  // OTP_MAX_ATTEMPTS in auth.service.ts).
  @Prop({
    default: 0,
    select: false,
  })
  otpAttempts!: number;

  // When the OTP was last (re)issued — enforces the resend cooldown so a
  // user (or an attacker) can't trigger unlimited verification emails.
  @Prop()
  otpLastSentAt?: Date;

  @Prop({
    select: false,
    index: true,
  })
  passwordResetTokenHash?: string;

  @Prop()
  passwordResetExpiresAt?: Date;

  // Any JWT issued before this timestamp is rejected by JwtStrategy — this is
  // what makes the password-reset email's "every other device has been
  // signed out" claim actually true despite JWTs otherwise being stateless.
  @Prop()
  passwordChangedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
