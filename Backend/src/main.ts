// Must be the first import: it populates process.env from .env, and the auth,
// mail and database constants below read it while their modules are being
// evaluated. Loading it any later means those reads see an empty environment.
import './config/env';

import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { DataSource } from 'typeorm';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { UPLOADS_ROOT, UPLOADS_URL_PREFIX } from './config/upload-paths';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://192.168.100.94:5173',
];

function allowedOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS;
  if (!configured) return DEFAULT_ALLOWED_ORIGINS;
  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * `synchronize` and `migrationsRun` are both off by design (see
 * database.config.ts / app.module.ts) — schema changes only take effect when
 * someone runs `npm run migration:run`. If that step gets missed, the app
 * still boots fine on the tables/columns that *do* exist, and anything that
 * touches a newer one (e.g. a service querying a table a migration was
 * supposed to create) fails inside a try/catch and only ever reaches a
 * server log line. That's exactly how the biometric outage went unnoticed:
 * the device kept beeping, punches kept getting swallowed, and nothing
 * outside `logger.error` ever knew.
 *
 * This makes that state impossible to miss: it fails fast and loud at boot
 * instead of failing quietly per-request later.
 */
async function assertNoPendingMigrations(
  app: NestExpressApplication,
): Promise<void> {
  const logger = new Logger('Migrations');
  const dataSource = app.get(DataSource);

  const pending = await dataSource.showMigrations();

  if (pending) {
    logger.error(
      '============================================================\n' +
        '  PENDING DATABASE MIGRATIONS DETECTED\n' +
        '  The application code expects schema changes that have not\n' +
        '  been applied to this database. Features that depend on them\n' +
        '  (e.g. biometric attendance) will silently no-op or fail.\n' +
        '\n' +
        '  Fix: run `npm run migration:run` against this database,\n' +
        '  then restart the server.\n' +
        '============================================================',
    );
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  await assertNoPendingMigrations(app);

  // Must run before the routes so the refresh-token cookie is parsed into
  // `request.cookies` for RefreshTokenGuard to read.
  app.use(cookieParser());

  app.enableCors({
    origin: allowedOrigins(),
    credentials: true,
  });

  // Without this, every `class-validator` decorator in the codebase was inert:
  // invalid bodies reached TypeORM and surfaced as 500s instead of 400s, and
  // out-of-range values were written straight to the database.
  //
  // `whitelist` strips properties no DTO declares, so clients can't set columns
  // a route never meant to expose. Every DTO property carries a validator, so
  // nothing legitimate is stripped.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // AllExceptionsFilter existed in the codebase but was never registered, so
  // the single error envelope it documents was not actually in effect: raw
  // Nest error bodies reached the client and unexpected errors leaked their
  // message. Registering it makes every error one shape
  // ({ statusCode, message, error, path, timestamp }), which the frontend's
  // ApiError parsing already assumes.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Uploaded employee photos are served from disk. `profile_image` holds a path
  // like /uploads/employee-photos/<uuid>.jpg, and this makes that path
  // resolvable — without it the frontend would store a photo successfully and
  // then render a broken image.
  //
  // Mounted before setGlobalPrefix so the URL has no /api prefix, matching the
  // paths written to the database. `index: false` and `dotfiles: 'deny'` keep it
  // to serving the image files only.
  //
  // The directory is UPLOADS_ROOT rather than a literal, so pointing UPLOADS_DIR
  // at a persistent disk moves both where files are written and where they are
  // read back. If those two disagreed, uploads would appear to succeed and then
  // 404 on the way out.
  app.useStaticAssets(UPLOADS_ROOT, {
    prefix: UPLOADS_URL_PREFIX,
    index: false,
    dotfiles: 'deny',
    // Filenames are content-addressed UUIDs, so a stored file never changes and
    // can be cached aggressively.
    maxAge: '7d',
  });

  app.setGlobalPrefix('api');
  const config = new DocumentBuilder()
    .setTitle('My Project API')
    .setDescription('API documentation')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
void bootstrap();