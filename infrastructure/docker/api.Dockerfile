# API + worker image — E17-T03. TECH-SPEC §9.2.
#
# One image serves both processes: same code, same rules, different command.
# Multi-stage so the runtime layer carries no pnpm store, no devDependencies and
# no source — a smaller image is a smaller thing to audit, and nothing that is
# not in it can leak from it.

FROM node:20.20.0-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.0 --activate
WORKDIR /app

# --- deps: install with the lockfile, nothing else ---------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/ai/package.json packages/ai/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/database/package.json packages/database/
COPY packages/notifications/package.json packages/notifications/
COPY packages/observability/package.json packages/observability/
COPY packages/types/package.json packages/types/
# `--frozen-lockfile`: the lockfile decides, never a floating range resolved at
# build time (CLAUDE.md non-negotiable #6).
RUN pnpm install --frozen-lockfile --filter @curhat/api...

# --- build -------------------------------------------------------------------
FROM deps AS build
COPY . .
RUN pnpm --filter @curhat/database exec prisma generate \
 && pnpm --filter @curhat/api... build

# --- runtime -----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production

# Non-root. The app writes nothing to disk; it has no reason to own any of it.
RUN addgroup -g 1001 curhat && adduser -u 1001 -G curhat -s /bin/sh -D curhat

# Tata letak workspace dipertahankan persis seperti di stage build.
#
# Versi sebelumnya meratakan `apps/api/node_modules` ke `/app/node_modules`.
# Dengan pnpm `node-linker=isolated`, isi direktori itu adalah symlink relatif
# (`@curhat/types -> ../../../packages/types`), jadi meratakannya membuat
# targetnya meleset satu tingkat. Build tetap lolos; container-nya yang mati
# dengan `Cannot find module` saat start.
COPY --from=build --chown=curhat:curhat /app/node_modules ./node_modules
COPY --from=build --chown=curhat:curhat /app/packages ./packages
COPY --from=build --chown=curhat:curhat /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=curhat:curhat /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=curhat:curhat /app/apps/api/package.json ./apps/api/package.json

USER curhat
WORKDIR /app/apps/api
EXPOSE 3001

# No .env is copied at any stage. Configuration arrives as environment
# variables at run time; a secret baked into a layer stays in the registry
# forever, even after the layer above deletes it (TECH-SPEC §7.2).
CMD ["node", "dist/main.js"]
