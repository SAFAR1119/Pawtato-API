import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { UsersService } from '../../users/users.service';
import { AccountStatus } from '../../../common/enums/account-status.enum';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findAuthState(payload.sub);

    if (!user || !user.isActive || user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException();
    }

    // Rejects any token issued before the account's most recent password
    // change — what makes the password-reset email's "every other device
    // has been signed out" claim actually true, despite JWTs otherwise
    // being stateless (no server-side session/refresh-token store exists
    // in this codebase to revoke directly).
    if (
      user.passwordChangedAt &&
      payload.iat !== undefined &&
      payload.iat * 1000 < user.passwordChangedAt.getTime()
    ) {
      throw new UnauthorizedException(
        'Session expired due to a password change',
      );
    }

    return payload;
  }
}
