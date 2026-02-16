import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { EnvConfig } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      trustProxy: true,
    }),
    {
      bufferLogs: true,
    },
  );

  const configService = app.get(ConfigService<EnvConfig, true>);
  const logger = app.get(Logger);

  app.useLogger(logger);

  // Security - Helmet
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
        scriptSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  });

  // Rate limiting for auth endpoints
  await app.register(rateLimit, {
    max: configService.get<number>('RATE_LIMIT_AUTH_MAX'),
    timeWindow: configService.get<number>('RATE_LIMIT_AUTH_WINDOW_MS'),
    allowList: [],
    keyGenerator: (request) => {
      return request.ip || 'unknown';
    },
    errorResponseBuilder: () => ({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later.',
      },
    }),
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });

  // API Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global Exception Filter
  app.useGlobalFilters(new HttpExceptionFilter(logger));

  // Swagger/OpenAPI setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Auth Service API')
    .setDescription('Authentication service with JWT and refresh tokens')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT token',
        in: 'header',
      },
      'access-token',
    )
    .addTag('auth', 'Authentication endpoints')
    .addTag('well-known', 'OpenID Connect discovery endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // CORS
  app.enableCors({
    origin: configService.get('NODE_ENV') === 'development' ? true : false,
    credentials: true,
  });

  // Enable graceful shutdown hooks
  app.enableShutdownHooks();

  const port = configService.get('PORT');
  await app.listen(port, '0.0.0.0');

  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`Swagger documentation: http://localhost:${port}/api/docs`);

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}, starting graceful shutdown...`);
    await app.close();
    logger.log('Application shut down gracefully');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();
