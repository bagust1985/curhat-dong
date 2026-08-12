import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { loadServerEnv } from '@curhat/config/env/server';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { ResponseInterceptor } from './common/response.interceptor.js';
import { RedisIoAdapter } from './common/redis-io.adapter.js';
import { ENV } from './config/env.config.js';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard.js';
import { SessionService } from './modules/auth/session.service.js';

/**
 * Loads .env for local development using Node's built-in loader (no dotenv
 * dependency). Production supplies real environment variables via Docker, and
 * a .env file is not expected to exist there (TECH-SPEC §7.2).
 *
 * Walks up from the working directory because the API is usually started from
 * apps/api while .env lives at the monorepo root.
 */
function loadDotEnvForDevelopment(): void {
  if (process.env.NODE_ENV === 'production') return;

  let dir = process.cwd();
  for (;;) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      process.loadEnvFile?.(candidate);
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return; // reached the filesystem root — no .env, fine
    dir = parent;
  }
}

async function bootstrap(): Promise<void> {
  loadDotEnvForDevelopment();

  // Parsed before the app is created: a bad configuration should stop the
  // process here, not halfway through wiring modules.
  const env = loadServerEnv();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.setGlobalPrefix('v1');
  app.use(helmet());
  app.use(compression());
  // Web clients carry the refresh token in an HttpOnly cookie (TECH-SPEC §5.1).
  app.use(cookieParser());

  app.enableCors({
    origin: [env.APP_URL, env.ADMIN_URL],
    credentials: true, // refresh token travels as an HttpOnly cookie (TECH-SPEC §5.1)
  });

  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // Authentication is on by default; a route opts out with @Public().
  // The reverse — opt in per route — is how an endpoint ends up unprotected
  // because someone forgot a decorator.
  app.useGlobalGuards(
    new JwtAuthGuard(app.get(ENV), app.get(Reflector), app.get(SessionService)),
  );

  // No global ValidationPipe: CLAUDE.md specifies Zod at the API boundary, so
  // controllers apply ZodValidationPipe per route. Registering Nest's
  // class-validator pipe as well would mean two validation stacks disagreeing
  // about the same request.

  // Realtime namespace `/rt` with a Redis backplane (TECH-SPEC §3.5). Installed
  // before listening so every socket is registered with the same adapter.
  app.useWebSocketAdapter(await RedisIoAdapter.create(app));

  app.enableShutdownHooks();

  const port = Number(new URL(env.API_URL).port) || 3001;
  await app.listen(port, '0.0.0.0');

  Logger.log(`API listening on ${env.API_URL} (prefix /v1)`, 'Bootstrap');
}

void bootstrap();
