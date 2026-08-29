import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UserDocument } from '../users/schemas/user.schema';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { isDuplicateKeyError } from '../../common/utils/mongo.util';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { generateToken, hashToken } from './utils/token.util';
import { generateOtp, hashOtp, otpHashesMatch } from './utils/otp.util';
import { normalizeEmail } from './utils/email.util';
import { describeUserAgent } from './utils/user-agent.util';
import { formatDhakaDateTime } from './utils/date.util';
import { extractEmailAddress } from '../../mail/mail-address.util';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_TTL_LABEL = '10 minutes';
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const PASSWORD_RESET_TTL_LABEL = '1 hour';

const GENERIC_RESET_MESSAGE =
  'If that email is registered, a password reset link has been sent.';
const GENERIC_RESEND_OTP_MESSAGE =
  'If that account exists and needs verification, a new code has been sent.';
const PENDING_VERIFICATION_MESSAGE = 'Verification code sent to your email.';
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';
const INVALID_OTP_MESSAGE = 'Invalid or expired OTP.';
const OTP_ATTEMPTS_EXCEEDED_MESSAGE =
  'Too many incorrect attempts. Please request a new verification code.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    // Deliberate exception to the Phase 4 "no direct NotificationsService
    // calls" convention: these are security-sensitive, single-purpose
    // transactional emails that must never be persisted as a general in-app
    // Notification (unlike the domain-event-driven business notifications),
    // so they're sent directly rather than routed through the event bus.
    private readonly notificationsService: NotificationsService,
  ) {}

  // Core business rule: an email exists in the system as either a pending
  // (unverified) or active account, and it's never possible to end up with
  // two accounts for the same normalized email. See handleExistingAccount()
  // for how each pre-existing state is handled, and the catch block below
  // for how a concurrent duplicate registration (the DB unique index losing
  // the race) collapses into the same behavior instead of a 500.
  async register(dto: RegisterDto) {
    const email = normalizeEmail(dto.email);
    const existing = await this.usersService.findByEmail(email);

    if (existing) {
      return this.handleExistingAccountOnRegister(existing);
    }

    let user: UserDocument;

    try {
      user = await this.usersService.createUser({ ...dto, email });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const racedUser = await this.usersService.findByEmail(email);

        if (racedUser) {
          return this.handleExistingAccountOnRegister(racedUser);
        }
      }

      throw error;
    }

    await this.issueOtp(user.id, user.email, user.fullName);

    return this.pendingVerificationResponse(user.email);
  }

  private async handleExistingAccountOnRegister(user: UserDocument) {
    if (user.status === AccountStatus.ACTIVE) {
      throw new ConflictException('Email already registered.');
    }

    // Pending account: never create a second one. Re-trigger verification
    // instead (subject to the same resend cooldown as an explicit
    // resend-otp call, so double-clicking Register can't spam the mailbox).
    await this.issueOtpIfCooldownElapsed(user);

    return this.pendingVerificationResponse(user.email);
  }

  private pendingVerificationResponse(email: string) {
    return {
      message: PENDING_VERIFICATION_MESSAGE,
      email,
      status: AccountStatus.PENDING_VERIFICATION,
    };
  }

  async login(loginDto: LoginDto) {
    const email = normalizeEmail(loginDto.email);
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    // Credentials are valid, but a pending account must never receive an
    // authenticated session — send a fresh OTP and let the frontend route
    // to the verification screen instead. The response shape (no
    // accessToken, `verificationRequired: true`) is how the frontend tells
    // this apart from a normal successful login.
    if (user.status === AccountStatus.PENDING_VERIFICATION) {
      await this.issueOtpIfCooldownElapsed(user);

      return {
        verificationRequired: true,
        message:
          'Your email is not verified yet. A verification code has been sent.',
        email: user.email,
        status: AccountStatus.PENDING_VERIFICATION,
      };
    }

    return this.buildAuthResponse(user);
  }

  // Verifies the OTP for either flow (post-registration or triggered by a
  // login attempt on a still-pending account) — both converge here, and
  // success always activates the account and logs the user in immediately,
  // so the frontend never has to send them back through login/OTP as two
  // separate steps.
  async verifyOtp(dto: VerifyOtpDto) {
    const email = normalizeEmail(dto.email);
    const user = await this.usersService.findByEmail(email);

    if (
      !user ||
      user.status === AccountStatus.ACTIVE ||
      !user.otpHash ||
      !user.otpExpiresAt
    ) {
      // Covers: unknown email, already-verified account, no OTP ever
      // issued, and an OTP already consumed by a prior successful verify —
      // all collapse to the same generic message so none of them can be
      // told apart by an attacker probing the endpoint.
      throw new BadRequestException(INVALID_OTP_MESSAGE);
    }

    if (user.otpExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException(INVALID_OTP_MESSAGE);
    }

    if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
      await this.usersService.clearOtp(user.id);
      throw new BadRequestException(OTP_ATTEMPTS_EXCEEDED_MESSAGE);
    }

    const submittedHash = hashOtp(dto.otp);

    if (!otpHashesMatch(submittedHash, user.otpHash)) {
      await this.usersService.incrementOtpAttempts(user.id);
      throw new BadRequestException(INVALID_OTP_MESSAGE);
    }

    const activatedUser = await this.usersService.activateAccount(user.id);

    return this.buildAuthResponse(activatedUser!);
  }

  async resendOtp(dto: ResendOtpDto) {
    const email = normalizeEmail(dto.email);
    const user = await this.usersService.findByEmail(email);

    // Same anti-enumeration reasoning as forgotPassword: never reveal
    // whether the email is registered or already verified.
    if (!user || user.status === AccountStatus.ACTIVE) {
      return { message: GENERIC_RESEND_OTP_MESSAGE };
    }

    if (user.otpLastSentAt) {
      const elapsedMs = Date.now() - user.otpLastSentAt.getTime();

      if (elapsedMs < OTP_RESEND_COOLDOWN_MS) {
        const waitSeconds = Math.ceil(
          (OTP_RESEND_COOLDOWN_MS - elapsedMs) / 1000,
        );

        throw new BadRequestException(
          `Please wait ${waitSeconds}s before requesting another code.`,
        );
      }
    }

    await this.issueOtp(user.id, user.email, user.fullName);

    return { message: GENERIC_RESEND_OTP_MESSAGE };
  }

  async forgotPassword(dto: ForgotPasswordDto, userAgent?: string) {
    const user = await this.usersService.findByEmail(normalizeEmail(dto.email));

    if (user) {
      const token = generateToken();
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

      await this.usersService.setPasswordResetToken(
        user._id.toString(),
        tokenHash,
        expiresAt,
      );

      const resetUrl = this.buildFrontendUrl('/reset', { token });

      await this.sendTemplateEmail(
        user.email,
        'Reset your Pawtato password',
        'forgot-password',
        {
          name: user.fullName,
          resetUrl,
          expiresIn: PASSWORD_RESET_TTL_LABEL,
          requestContext: describeUserAgent(userAgent),
          supportEmail: this.supportEmail,
        },
      );
    }

    // Same reasoning as resendOtp: never reveal whether the email is
    // registered.
    return { message: GENERIC_RESET_MESSAGE };
  }

  async resetPassword(dto: ResetPasswordDto, userAgent?: string) {
    const tokenHash = hashToken(dto.token);
    const user = await this.usersService.findByResetTokenHash(tokenHash);

    if (
      !user ||
      !user.passwordResetExpiresAt ||
      user.passwordResetExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Invalid or expired reset link');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    const changedAt = await this.usersService.resetPassword(
      user._id.toString(),
      hashedPassword,
    );

    await this.sendTemplateEmail(
      user.email,
      'Your Pawtato password was changed',
      'password-reset',
      {
        name: user.fullName,
        changedAt: formatDhakaDateTime(changedAt),
        requestContext: describeUserAgent(userAgent),
        loginUrl: this.buildFrontendUrl('/login'),
        supportEmail: this.supportEmail,
      },
    );

    return { message: 'Password reset successfully. You can now log in.' };
  }

  private async buildAuthResponse(user: UserDocument) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    };
  }

  // Sends a fresh OTP unconditionally — used for a brand-new registration
  // and for an explicit resend-otp request (both are single user-initiated
  // actions that deserve a direct outcome, cooldown enforcement for resend
  // already having happened in the caller).
  private async issueOtp(userId: string, email: string, fullName: string) {
    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.usersService.setOtp(userId, otpHash, expiresAt);

    await this.sendTemplateEmail(
      email,
      'Your Pawtato verification code',
      'verify-otp',
      {
        name: fullName,
        otp,
        expiresIn: OTP_TTL_LABEL,
        supportEmail: this.supportEmail,
      },
    );
  }

  // Used where sending a new OTP is a side effect of something else the
  // user did (restarting registration, logging into a still-pending
  // account) rather than a deliberate "resend" click — silently skips
  // sending if the last OTP is still within its cooldown window instead of
  // erroring, since a recent code is presumably already sitting in their
  // inbox and a double-submit (e.g. a double-clicked button) shouldn't
  // trigger a duplicate email.
  private async issueOtpIfCooldownElapsed(user: UserDocument) {
    if (user.otpLastSentAt) {
      const elapsedMs = Date.now() - user.otpLastSentAt.getTime();

      if (elapsedMs < OTP_RESEND_COOLDOWN_MS) {
        return;
      }
    }

    await this.issueOtp(user.id, user.email, user.fullName);
  }

  // A failed email send must never fail the request that already succeeded
  // (registration, forgot-password, reset-password) — best-effort, logged
  // on failure.
  private async sendTemplateEmail(
    to: string,
    subject: string,
    template: string,
    context: Record<string, unknown>,
  ) {
    try {
      await this.notificationsService.sendTemplateEmail(
        to,
        subject,
        template,
        context,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send "${template}" email to ${to}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private buildFrontendUrl(
    pathname: string,
    query?: Record<string, string>,
  ): string {
    const base = this.configService
      .get<string>('app.frontendUrl', 'http://localhost:3000')
      .replace(/\/$/, '');

    const search = query ? `?${new URLSearchParams(query).toString()}` : '';

    return `${base}${pathname}${search}`;
  }

  private get supportEmail(): string {
    return extractEmailAddress(
      this.configService.get<string>('mail.from', 'hello@pawtato.app'),
    );
  }
}
