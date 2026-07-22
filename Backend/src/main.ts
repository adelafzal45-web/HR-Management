import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Allow the frontend (running on a different origin) to actually receive responses
  app.enableCors({ origin: true }); // Every controller route now lives under /api/*, matching what the frontend expects

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
bootstrap();
