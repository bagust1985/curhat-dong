# Web and admin image — E17-T03.
#
# Parameterised by APP so one file builds both; they differ only in which
# workspace is built and which port they listen on.
#
# Next.js standalone output: the runtime layer gets the traced server and its
# minimal dependency set, not the whole node_modules tree.

ARG APP=web

FROM node:20.20.0-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.0 --activate
WORKDIR /app

FROM base AS deps
ARG APP
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/${APP}/package.json apps/${APP}/
COPY packages/config/package.json packages/config/
COPY packages/observability/package.json packages/observability/
COPY packages/types/package.json packages/types/
RUN pnpm install --frozen-lockfile --filter @curhat/${APP}...

FROM deps AS build
ARG APP
COPY . .
# Public build-time values only. Anything secret would be inlined into the
# client bundle and readable by anyone (TECH-SPEC §7.2).
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY}
RUN pnpm --filter @curhat/${APP}... build

# `public/` opsional: apps/admin tidak punya satu pun aset statis, dan COPY
# terhadap direktori yang tidak ada menggagalkan build. Dibuat kosong di sini
# supaya stage runtime tidak perlu tahu app mana yang punya.
RUN mkdir -p apps/${APP}/public

FROM base AS runtime
ARG APP
ENV NODE_ENV=production
# Kept as an env var because the start command needs it at run time, and an
# ARG does not survive into the running container.
ENV APP=${APP}

RUN addgroup -g 1001 curhat && adduser -u 1001 -G curhat -s /bin/sh -D curhat

COPY --from=build --chown=curhat:curhat /app/apps/${APP}/.next/standalone ./
COPY --from=build --chown=curhat:curhat /app/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=build --chown=curhat:curhat /app/apps/${APP}/public ./apps/${APP}/public

USER curhat
# Shell form so ${APP} expands; the exec form would look for a literal path.
CMD node apps/${APP}/server.js
