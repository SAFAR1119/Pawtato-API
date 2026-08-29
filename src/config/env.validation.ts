import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(5000),
  API_PREFIX: Joi.string().default('api'),
  APP_URL: Joi.string().uri().default('http://localhost:5000'),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),
  CORS_ORIGINS: Joi.string().allow('').default(''),

  MONGO_URI: Joi.string().required(),

  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES: Joi.string().required(),
  REFRESH_SECRET: Joi.string().min(16).required(),
  REFRESH_EXPIRES: Joi.string().required(),

  MAIL_HOST: Joi.string().optional(),
  MAIL_PORT: Joi.number().optional(),
  MAIL_USER: Joi.string().optional(),
  MAIL_PASSWORD: Joi.string().optional(),
  MAIL_FROM: Joi.string().optional(),

  STORAGE_PROVIDER: Joi.string().valid('local', 's3').default('local'),
  S3_BUCKET: Joi.string().when('STORAGE_PROVIDER', {
    is: 's3',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  S3_REGION: Joi.string().when('STORAGE_PROVIDER', {
    is: 's3',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  S3_ENDPOINT: Joi.string().uri().optional(),
  S3_ACCESS_KEY_ID: Joi.string().when('STORAGE_PROVIDER', {
    is: 's3',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  S3_SECRET_ACCESS_KEY: Joi.string().when('STORAGE_PROVIDER', {
    is: 's3',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  S3_PUBLIC_URL: Joi.string().uri().optional(),
  S3_FORCE_PATH_STYLE: Joi.string().valid('true', 'false').optional(),

  DATING_POOL_RESET_DAYS: Joi.number().integer().min(1).default(3),

  // Optional — the QR tag ordering/commerce endpoints (Phase 19) throw a
  // clear 503 at request time if these are unset rather than failing boot,
  // since this feature is additive and shouldn't block the rest of the API
  // from starting in an environment that hasn't set up Stripe yet.
  STRIPE_SECRET_KEY: Joi.string().optional(),
  STRIPE_WEBHOOK_SECRET: Joi.string().optional(),
  TAG_UNIT_PRICE_CENTS: Joi.number().integer().min(1).default(999),
  STRIPE_CURRENCY: Joi.string().lowercase().default('usd'),

  // Optional — same "additive feature, throws a clear error at use rather
  // than failing boot" pattern as Stripe above. Without these, PushChannel
  // logs a warning and skips sending instead of crashing the domain-event
  // listener that calls it. Generate a pair with `npm run vapid:generate`.
  VAPID_PUBLIC_KEY: Joi.string().optional(),
  VAPID_PRIVATE_KEY: Joi.string().optional(),
  VAPID_SUBJECT: Joi.string().optional(),
});
