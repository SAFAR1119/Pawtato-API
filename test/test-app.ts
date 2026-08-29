import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';

// Mirrors the pipe/interceptor/filter/prefix setup in src/main.ts so e2e
// tests see exactly the same request/response shape as production — minus
// helmet and app.listen(), which don't affect what supertest observes when
// driving the app in-process. `configure` lets a spec override a provider
// (e.g. NotificationsService, to capture an OTP that's normally only ever
// emailed out) before the module compiles.
export async function createTestApp(
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<INestApplication<App>> {
  let builder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (configure) {
    builder = configure(builder);
  }

  const moduleFixture = await builder.compile();

  const app = moduleFixture.createNestApplication<NestExpressApplication>({
    // Mirrors main.ts — only the Stripe webhook route reads req.rawBody, but
    // it must be enabled app-wide (it only adds the field, never disables
    // JSON parsing for any other route) for that spec to work under supertest.
    rawBody: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.init();

  return app;
}
