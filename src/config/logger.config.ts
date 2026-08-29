import * as winston from 'winston';
import { WinstonModule, utilities } from 'nest-winston';

const REDACTED = '[REDACTED]';
const SENSITIVE_KEYS = new Set([
  'password',
  'newPassword',
  'currentPassword',
  'accessToken',
  'refreshToken',
  'token',
  'authorization',
  'secret',
]);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) =>
        SENSITIVE_KEYS.has(key) ? [key, REDACTED] : [key, redact(val)],
      ),
    );
  }

  return value;
}

const redactFormat = winston.format(
  (info) => redact(info) as winston.Logform.TransformableInfo,
)();

const isProduction = process.env.NODE_ENV === 'production';

export const winstonLogger = WinstonModule.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: isProduction
    ? winston.format.combine(
        redactFormat,
        winston.format.timestamp(),
        winston.format.json(),
      )
    : winston.format.combine(
        redactFormat,
        winston.format.timestamp(),
        utilities.format.nestLike('Pawtato', {
          colors: true,
          prettyPrint: true,
        }),
      ),
  transports: [new winston.transports.Console()],
});
