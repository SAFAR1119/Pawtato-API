export default () => ({
  app: {
    port: parseInt(process.env.PORT || '5000', 10),
    environment: process.env.NODE_ENV || 'development',
    apiPrefix: process.env.API_PREFIX || 'api',
    url: process.env.APP_URL || 'http://localhost:5000',
    // Where users land after clicking a link from a transactional email
    // (verify/reset) — the frontend app, not this API.
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    corsOrigins: (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },

  database: {
    uri: process.env.MONGO_URI,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expires: process.env.JWT_EXPIRES,
    refreshSecret: process.env.REFRESH_SECRET,
    refreshExpires: process.env.REFRESH_EXPIRES,
  },

  mail: {
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT || '587', 10),
    user: process.env.MAIL_USER,
    password: process.env.MAIL_PASSWORD,
    from: process.env.MAIL_FROM || 'Pawtato <no-reply@pawtato.app>',
  },

  storage: {
    provider: process.env.STORAGE_PROVIDER || 'local',
    s3: {
      bucket: process.env.S3_BUCKET,
      region: process.env.S3_REGION,
      endpoint: process.env.S3_ENDPOINT,
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      publicUrl: process.env.S3_PUBLIC_URL,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    },
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    currency: (process.env.STRIPE_CURRENCY || 'usd').toLowerCase(),
    tagUnitPriceCents: parseInt(process.env.TAG_UNIT_PRICE_CENTS || '999', 10),
  },

  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT || 'mailto:no-reply@pawtato.app',
  },

  dating: {
    // How long a swiped-on pet (LIKE or PASS, as long as it never became an
    // ACTIVE match) stays hidden from that pet's discover() pool before it's
    // eligible to reappear. An ACTIVE match is excluded independently of
    // this window (see DatingService.getActiveMatchPartnerIds) and never
    // reappears on its own — only an explicit unmatch hands it back to this
    // same reset rule.
    poolResetDays: parseInt(process.env.DATING_POOL_RESET_DAYS || '3', 10),
  },
});
