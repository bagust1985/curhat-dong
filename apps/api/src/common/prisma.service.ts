import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import type { ServerEnv } from '@curhat/config/env/server';
import { createPrismaClient, type PrismaClient } from '@curhat/database';

import { ENV } from '../config/env.config.js';

export const PRISMA = Symbol('CURHAT_PRISMA');

@Injectable()
class PrismaLifecycle implements OnModuleDestroy {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PRISMA,
      inject: [ENV],
      useFactory: (env: ServerEnv): PrismaClient => createPrismaClient(env.DATABASE_URL),
    },
    PrismaLifecycle,
  ],
  exports: [PRISMA],
})
export class PrismaModule {}
