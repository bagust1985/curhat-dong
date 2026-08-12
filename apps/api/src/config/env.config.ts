import { Global, Module } from '@nestjs/common';
import { loadServerEnv, type ServerEnv } from '@curhat/config/env/server';

export const ENV = Symbol('CURHAT_SERVER_ENV');

/**
 * Validates environment at module construction, i.e. at boot.
 *
 * A missing variable kills the process here with a message naming the variable,
 * rather than surfacing as a confusing runtime failure on the first request
 * that happens to need it.
 */
@Global()
@Module({
  providers: [
    {
      provide: ENV,
      useFactory: (): ServerEnv => loadServerEnv(),
    },
  ],
  exports: [ENV],
})
export class EnvModule {}
