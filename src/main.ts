import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { translateValidationErrors } from './common/validation-error-translator';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Sin esto, un DTO invalido responde con los mensajes en ingles crudo
      // que genera class-validator por defecto (ej. "password must be longer
      // than or equal to 1 characters") - ver validation-error-translator.
      exceptionFactory: (errors) => new BadRequestException(translateValidationErrors(errors)),
    }),
  );

  // Sin CORS_ORIGIN (dev local), acepta cualquier origin - ver .env.example.
  // En produccion, CORS_ORIGIN restringe a los dominios del frontend (ej. el
  // dominio de Vercel) separados por coma.
  const corsOrigins = process.env.CORS_ORIGIN?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : true });

  // Almacenamiento local de imagenes del catalogo (seccion 9 del SDD, modo
  // LOCAL_FILESYSTEM) - ver ImageStorageService.
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
bootstrap();
