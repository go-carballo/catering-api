import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard';
import { CompanyTypeGuard } from './shared/guards/company-type.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend
  const allowedOrigins = [
    'http://localhost:3001',
    'http://localhost:3000',
    'https://catering-frontend-two.vercel.app',
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global JWT auth guard
  const reflector = app.get(Reflector);
  app.useGlobalGuards(
    new JwtAuthGuard(reflector),
    new CompanyTypeGuard(reflector),
  );

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Catering API')
    .setDescription(
      'API for managing catering services, contracts, and service days',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication operations')
    .addTag('caterings', 'Catering company operations')
    .addTag('clients', 'Client company operations')
    .addTag('contracts', 'Contract management')
    .addTag('service-days', 'Service day tracking')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3000;
  console.log(`📍 Attempting to listen on port: ${port}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
  console.log(
    `🔧 All env vars:`,
    Object.keys(process.env).filter(
      (k) => !k.includes('SECRET') && !k.includes('PASSWORD'),
    ),
  );

  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Catering API running on http://localhost:${port}/api`);
  console.log(`📚 Swagger docs at http://localhost:${port}/docs`);
}

bootstrap();
