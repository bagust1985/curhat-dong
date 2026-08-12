import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client.js';

export * from '../generated/prisma/enums.js';
export { PrismaClient } from '../generated/prisma/client.js';

/**
 * Prisma 7 client using the `@prisma/adapter-pg` driver adapter (TECH-SPEC
 * §1.1). Prisma 7 conventions, not Prisma 6.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });

  return new PrismaClient({
    adapter,
    // Errors and warnings only. Query logging would print post bodies and chat
    // messages into the application log — exactly what non-negotiable #3
    // forbids.
    log: ['error', 'warn'],
  });
}

let cached: PrismaClient | undefined;

/**
 * Process-wide singleton.
 *
 * Guarded against the dev-server hot-reload case, where a new client per reload
 * exhausts the connection pool within a few edits.
 */
export function getPrismaClient(databaseUrl: string): PrismaClient {
  cached ??= createPrismaClient(databaseUrl);
  return cached;
}

export async function disconnectPrisma(): Promise<void> {
  await cached?.$disconnect();
  cached = undefined;
}
