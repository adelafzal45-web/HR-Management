import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'path';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';


const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
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

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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
  app.useStaticAssets(resolve(process.cwd(), 'uploads'), {
    prefix: '/uploads',
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
