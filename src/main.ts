import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { swaggerConfig } from './config/swagger.config';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ValidationException } from './common/exceptions/base.exception';
import { AppThrottlerGuard } from './common/guards/throttler.guard';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Fail fast if required secrets are missing
  const jwtSecret = configService.get<string>('JWT_SECRET');
  const jwtRefreshSecret = configService.get<string>('JWT_REFRESH_SECRET');
  if (!jwtSecret) {
    throw new Error('CRITICAL: JWT_SECRET environment variable must be set.');
  }
  if (!jwtRefreshSecret) {
    throw new Error('CRITICAL: JWT_REFRESH_SECRET environment variable must be set.');
  }

  const isProduction =
    (configService.get<string>('NODE_ENV') || process.env.NODE_ENV) === 'production';
  const bffInternalSecret = configService.get<string>('BFF_INTERNAL_SECRET');
  if (isProduction && !bffInternalSecret) {
    throw new Error(
      'CRITICAL: BFF_INTERNAL_SECRET environment variable must be set in production. ' +
        'Generate with: openssl rand -base64 32',
    );
  }

  // Enable cookie parsing (required for JWT from cookies)
  app.use(cookieParser());

  // Add security headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Log database configuration
  const databaseUrl = configService.get('DATABASE_URL');
  if (databaseUrl) {
    console.log('Database Config: Using DATABASE_URL (Railway/Production)');
    // Don't log the full DATABASE_URL for security reasons
    console.log('Database Provider: Railway PostgreSQL');
  } else {
    console.log(
      'Database Config: Using individual environment variables (Local Development)',
    );
    console.log('Database Details:', {
      host: configService.get('POSTGRES_HOST'),
      port: configService.get('POSTGRES_PORT'),
      username: configService.get('POSTGRES_USER'),
      database: configService.get('POSTGRES_DB'),
    });
  }

  // Enable validation with detailed error messages and exception handling
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      enableDebugMessages: process.env.NODE_ENV !== 'production',
      exceptionFactory: (errors) => {
        // Never echo submitted values back to clients (M3: prevents leaking passwords,
        // tokens, or other sensitive input in validation error responses)
        const details = errors.map((error) => ({
          field: error.property,
          constraints: error.constraints,
        }));
        return new ValidationException('Validation failed', details);
      },
    }),
  );

  // Apply global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Apply rate limiting
  app.useGlobalGuards(app.get(AppThrottlerGuard));

  // Enable CORS with strict configuration
  const corsOrigin = configService.get('CORS_ORIGIN');
  if (!corsOrigin) {
    throw new Error(
      'CRITICAL: CORS_ORIGIN environment variable must be set for security. ' +
      'Example: CORS_ORIGIN=http://localhost:3000 (development) or CORS_ORIGIN=https://your-domain.com (production)'
    );
  }

  app.enableCors({
    origin: corsOrigin,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204,
    credentials: true, // Allow credentials
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  console.log(`✅ CORS enabled for origin: ${corsOrigin}`);

  // Swagger documentation: disabled in production (H6)
  if (!isProduction) {
    const apiDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api', app, apiDocument);
  }

  // Start the server - Railway provides PORT, fallback to 3002 for local
  const port = configService.get('PORT') || process.env.PORT || 3002;
  await app.listen(port, '0.0.0.0'); // Listen on all interfaces for Railway

  const environment = process.env.NODE_ENV || 'development';

  console.log(`✅ Application started successfully!`);
  console.log(`Environment: ${environment}`);
  console.log(`Port: ${port}`);

  if (isProduction) {
    console.log(`🚂 Railway deployment detected`);
    console.log(`🌐 Application URL: Available in Railway dashboard`);
    console.log(`📚 Swagger API docs: /api endpoint`);
  } else {
    console.log(`🏠 Local development mode`);
    console.log(`Application is running on: http://localhost:${port}`);
    console.log(
      `Swagger documentation available at: http://localhost:${port}/api`,
    );
  }

  // CORS configuration is already logged above after enableCors
}


bootstrap();
