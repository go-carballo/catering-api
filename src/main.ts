import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard';
import { CompanyTypeGuard } from './shared/guards/company-type.guard';

/**
 * Validate required environment variables at startup
 */
function validateEnvironment(): void {
  const logger = new Logger('Environment');
  const requiredVars = ['DATABASE_URL', 'JWT_SECRET', 'NODE_ENV'];

  const missing = requiredVars.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    logger.error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
    process.exit(1);
  }

  logger.log(
    `Environment variables validated. Running in ${process.env.NODE_ENV} mode.`,
  );
}

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

  // Use PORT from environment (Railway sets this to 8080), default to 3000
  const port = parseInt(process.env.PORT || '3000', 10);
  const logger = new Logger('Bootstrap');
  logger.log(`API listening on port ${port}`);
  logger.log(`Environment: ${process.env.NODE_ENV}`);

  await app.listen(port, '0.0.0.0');

  logger.log(`Catering API running on http://localhost:${port}/api`);
  logger.log(`Swagger docs at http://localhost:${port}/docs`);
}

(async () => {
  validateEnvironment();
  await bootstrap();
})();
