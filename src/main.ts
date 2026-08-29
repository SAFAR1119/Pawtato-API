import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as express from 'express';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { winstonLogger } from './config/logger.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: winstonLogger,
    // Makes req.rawBody available on every request — only the Stripe webhook
    // route (POST /tag-orders/webhook) needs it, to verify the signature
    // against the exact bytes Stripe signed, but this option doesn't disable
    // JSON body parsing for any other route.
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 5000;
  const apiPrefix = configService.get<string>('app.apiPrefix') ?? 'api';
  const appUrl = configService.get<string>('app.url');
  const corsOrigins = configService.get<string[]>('app.corsOrigins') ?? [];

  app.use(
    helmet({
      // Images (avatars, pet photos, QR codes) are meant to be embedded by
      // frontends on other origins/ports — Helmet's default `same-origin`
      // CORP blocks that even when CORS headers are correct, since CORP is
      // a separate browser mechanism that isn't satisfied by an
      // Access-Control-Allow-Origin header. Real access control still comes
      // from CORS_ORIGINS (data endpoints) and JWT auth, not CORP.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
  });

  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Pawtato API')
    .setDescription(
      'Digital identity and lost & found platform for pets. Public, unauthenticated routes live under `/public`; everything else requires a bearer JWT obtained via `/auth/login`.',
    )
    .setVersion('1.0')
    .addServer(appUrl ?? `http://localhost:${port}`)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Authentication', 'Register, login, and token issuance')
    .addTag('Users', "Authenticated user's own profile")
    .addTag('Pets', "CRUD and lost/found status for a caller's own pets")
    .addTag(
      'Tags',
      'QR tag inventory and assign/unassign lifecycle, including admin bulk-manufacturing and claiming',
    )
    .addTag(
      'Public',
      'Unauthenticated routes: tag resolution, lost-pets listing, found reports',
    )
    .addTag('Scans', "A pet's QR scan history")
    .addTag('Found Reports', "Finder reports submitted against a pet's tag")
    .addTag('Medical Records', "A pet's medical history")
    .addTag('Vaccinations', "A pet's vaccination records and reminders")
    .addTag(
      'Notifications',
      "The caller's in-app notification feed (list, mark as read)",
    )
    .addTag(
      'Admin',
      'Admin-only dashboard, user/pet management, and found-report abuse review',
    )
    .addTag(
      'Activity',
      'Audit log of admin actions and sensitive self-service actions (tag lifecycle, lost/found status)',
    )
    .addTag('Health', 'Liveness check')
    .addTag(
      'Dating',
      'Pet dating profiles, swipe-to-match discovery, matches, lightweight in-app chat, and abuse reporting',
    )
    .addTag(
      'Tag Orders',
      'Order physical QR tags via Stripe Checkout; admin fulfillment/shipping',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(port);

  console.log(`🚀 Pawtato API running on ${appUrl}`);
  console.log(`📚 Swagger Docs: ${appUrl}/${apiPrefix}/docs`);
}

bootstrap().catch((error: unknown) => {
  // Ensures a crash during boot (bad env config, unreachable MongoDB, etc.)
  // always prints a clear, complete error before exiting, instead of relying
  // on Node's default unhandled-rejection formatting — which is what makes
  // failures like this hard to diagnose from a platform's build/deploy log.
  console.error('Fatal error during application bootstrap:', error);
  process.exit(1);
});
