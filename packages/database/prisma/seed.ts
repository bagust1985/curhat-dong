/**
 * Database seed (E02-T09).
 *
 * Idempotent: safe to run repeatedly. Everything is upserted by natural key.
 */

import { config } from 'dotenv';
import { join } from 'node:path';

import {
  APP_CONFIG_DEFAULTS,
  FEATURE_FLAG_DEFAULTS,
  SEED_CATEGORIES,
} from '../src/config-defaults.js';
import { createPrismaClient } from '../src/client.js';

// `prisma db seed` runs with packages/database as cwd.
config({ path: join(process.cwd(), '../../.env') });

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set. Check the monorepo root .env.');
}

const prisma = createPrismaClient(databaseUrl);

async function seedCategories(): Promise<void> {
  for (const [index, category] of SEED_CATEGORIES.entries()) {
    await prisma.postCategory.upsert({
      where: { slug: category.slug },
      // Display order is refreshed, but isActive is not: an admin who archived
      // a category should not have it silently resurrected by a re-seed.
      update: { name: category.name, icon: category.icon, displayOrder: index },
      create: {
        slug: category.slug,
        name: category.name,
        icon: category.icon,
        displayOrder: index,
        isActive: true,
      },
    });
  }
  console.warn(`  categories: ${SEED_CATEGORIES.length}`);
}

async function seedAppConfigs(): Promise<void> {
  for (const [key, value] of Object.entries(APP_CONFIG_DEFAULTS)) {
    await prisma.appConfig.upsert({
      where: { key },
      // Do NOT overwrite: these are tuned from the admin panel, and a re-seed
      // must not silently revert an operator's calibration.
      update: {},
      create: { key, value, description: 'Seeded default — see PRD §25.7' },
    });
  }
  console.warn(`  app_configs: ${Object.keys(APP_CONFIG_DEFAULTS).length}`);
}

async function seedFeatureFlags(): Promise<void> {
  for (const [key, value] of Object.entries(FEATURE_FLAG_DEFAULTS)) {
    await prisma.featureFlag.upsert({
      where: { key },
      update: {},
      create: { key, value, description: 'Seeded default' },
    });
  }
  console.warn(`  feature_flags: ${Object.keys(FEATURE_FLAG_DEFAULTS).length}`);
}

/**
 * Support resources are deliberately NOT seeded with data.
 *
 * PRD §15.2: a hotline number that is wrong or dead is more dangerous than
 * showing nothing, because someone in crisis dials it, fails, and feels more
 * alone. No number goes into this table until it has been verified against an
 * official source (E17-T12) — which is a release blocker, not a seed step.
 */
async function reportSupportResources(): Promise<void> {
  const active = await prisma.supportResource.count({ where: { isActive: true } });

  if (active === 0) {
    console.warn('');
    console.warn('  ⚠  support_resources: 0 active entries.');
    console.warn('     The Level 3 crisis screen has NOTHING to show (PRD §15.1).');
    console.warn('     Verified Indonesian hotlines must be added before launch');
    console.warn('     — see .agents/tasks/E17-T12-hotline-verification.md.');
    console.warn('     No placeholder numbers are seeded on purpose.');
  } else {
    console.warn(`  support_resources: ${active} active`);
  }
}

async function main(): Promise<void> {
  console.warn('Seeding CURHAT DONG…');
  await seedCategories();
  await seedAppConfigs();
  await seedFeatureFlags();
  await reportSupportResources();
  console.warn('');
  console.warn('Done.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
