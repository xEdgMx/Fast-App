import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cabeceras de seguridad. CSP desactivada para no romper las páginas de demo (mapas/CDN).
  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors();

  // Aviso de seguridad: no arrancar en producción con el secreto por defecto.
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.includes('dev-secret')) {
    new Logger('Bootstrap').warn(
      'JWT_SECRET es el de desarrollo. Define uno fuerte antes de producción.',
    );
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // elimina props no declaradas en el DTO
      forbidNonWhitelisted: true,
      transform: true, // convierte tipos (p. ej. string -> number)
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API escuchando en http://localhost:${port}`);
}

bootstrap();
