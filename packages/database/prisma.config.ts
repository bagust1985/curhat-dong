import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';
import { join } from 'node:path';

/**
 * Prisma 7 configuration (E02-T01).
 *
 * Prisma 7 conventions, not Prisma 6: the datasource URL lives here rather
 * than in schema.prisma, and the generator provider is `prisma-client`.
 *
 * The connection string is read from the monorepo root .env — this package has
 * no .env of its own, so there is exactly one place where the dev credentials
 * live.
 */
// Resolved from cwd rather than import.meta.url: this package is CommonJS
// (the generated Prisma client is CJS), and the Prisma CLI always runs with
// packages/database as its working directory.
config({ path: join(process.cwd(), '../../.env') });

export default defineConfig({
  // A folder, not a single file: the schema is split by domain so a change to
  // safety models does not produce a diff across the whole data model.
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
