import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { JwtPayload } from './interfaces/jwt-payload.interface';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({
    summary: 'Register a new Pawtato account',
    description:
      'Creates a pending account and emails a 6-digit verification code (valid 10 minutes). ' +
      'No access token is issued here — the account only becomes usable after verify-otp succeeds. ' +
      'If the email already has a pending (unverified) account, no new account is created and a ' +
      'fresh code is sent instead. If the email already belongs to a verified account, this fails ' +
      'with a conflict instead of sending anything.',
  })
  @ApiResponse({
    status: 201,
    description:
      'Pending account ready for verification; a code was sent (either a new account, or a resend for an existing pending one).',
  })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 409, description: 'Email already registered.' })
  @Throttle({ write: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @ApiOperation({
    summary: 'Log in with email and password',
    description:
      'Returns an access token only for a verified/active account. For a pending account with ' +
      'correct credentials, no token is issued — a new verification code is sent instead and the ' +
      'response body carries `verificationRequired: true` so the frontend can route to the OTP screen.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Either a normal login (accessToken + user) or, for a pending account, a verification-required response with no token.',
  })
  @ApiResponse({ status: 401, description: 'Invalid email or password.' })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @ApiOperation({ summary: 'Get the currently authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'The decoded JWT payload for the caller.',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid token.' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return user;
  }

  @ApiOperation({
    summary: 'Verify the 6-digit OTP sent to an email',
    description:
      'Used to complete both the post-registration flow and the pending-account-login flow — ' +
      'on success the account becomes Active and an access token is returned immediately (the ' +
      'user does not need to log in again).',
  })
  @ApiResponse({
    status: 200,
    description: 'Verified; account activated and access token issued.',
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP.' })
  @Throttle({ write: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @ApiOperation({
    summary: 'Resend the OTP for a pending account',
    description:
      'Generic confirmation message regardless of whether the email is registered or already ' +
      'verified (avoids account enumeration). Subject to a resend cooldown per account.',
  })
  @ApiResponse({
    status: 200,
    description: 'Generic confirmation message.',
  })
  @ApiResponse({
    status: 400,
    description: 'Resend cooldown still active for this account.',
  })
  @Throttle({ write: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('resend-otp')
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto);
  }

  @ApiOperation({ summary: 'Request a password reset link by email' })
  @ApiResponse({
    status: 200,
    description:
      'Generic confirmation message (does not reveal whether the email is registered).',
  })
  @Throttle({ write: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.forgotPassword(dto, userAgent);
  }

  @ApiOperation({
    summary:
      'Reset a password using the token from the reset link sent by forgot-password',
    description:
      'Called by the frontend page at FRONTEND_URL/reset?token=... with the token from the query string. ' +
      'On success, every existing session (JWT issued before this change) is invalidated and a receipt email is sent.',
  })
  @ApiResponse({ status: 200, description: 'Password reset successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid or expired reset link.' })
  @Throttle({ write: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  resetPassword(
    @Body() dto: ResetPasswordDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.resetPassword(dto, userAgent);
  }
}
