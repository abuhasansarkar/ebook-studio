# syntax=docker/dockerfile:1
# eBookStudio API + worker (same image, different command), plus a `migrate`
# target for the one-shot schema migration.
#
#   build     – all dependencies, compiles dist/, fetches and verifies fonts
#   prod-deps – production dependencies only (no dev tools, no tests)
#   migrate   – build stage + `prisma migrate deploy` (needs the Prisma CLI)
#   runtime   – the default, slim image the API and worker run from

ARG NODE_IMAGE=node:24-bookworm-slim
ARG PNPM_VERSION=11.13.1

FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app

# ---------------------------------------------------------------- build ----
FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/prisma.config.ts backend/
COPY backend/prisma backend/prisma
RUN pnpm install --frozen-lockfile --filter backend... --prod=false

COPY packages/shared packages/shared
COPY backend backend
# Interior fonts: vendored files are verified; CJK faces are downloaded and
# SHA-256 checked (the build fails on any mismatch).
RUN node backend/scripts/fetch-fonts.mjs
RUN pnpm --filter backend build

# -------------------------------------------------------------- migrate ----
# One-shot: docker-compose runs it before the API and worker start.
FROM build AS migrate
WORKDIR /app/backend
USER node
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ------------------------------------------------------------ prod-deps ----
FROM base AS prod-deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
# Scripts are skipped: the backend's postinstall (`prisma generate`) needs the
# dev-only CLI, and the generated client is already bundled into dist/.
# Native packages used at runtime (sharp, msgpackr) ship prebuilt binaries.
RUN pnpm install --frozen-lockfile --filter backend... --prod --ignore-scripts

# -------------------------------------------------------------- runtime ----
FROM ${NODE_IMAGE} AS runtime

# Chromium + Noto fonts for PDF rendering (Latin, Bengali, Devanagari, Tamil,
# Arabic, Urdu, CJK...), and the PostgreSQL 17 client tools (pg_dump, psql)
# the admin backups use. Debian bookworm ships client 15, which refuses to dump
# a 17 server, so the client comes from the PostgreSQL project's repository.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates wget \
 && install -d /usr/share/postgresql-common/pgdg \
 && wget -qO /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-noto-core fonts-noto-extra fonts-noto-cjk postgresql-client-17 \
 && rm -rf /var/lib/apt/lists/* \
 && pg_dump --version

# Chromium cannot create its sandbox as a non-root user under Docker's default
# seccomp profile, so the renderer passes --no-sandbox only when
# CHROMIUM_NO_SANDBOX=1 (set here; the container itself is the isolation).
# The bundled server resolves its default font and storage directories
# relative to dist/, which is wrong once bundled, so both are explicit. The
# storage path is the shared `storage` volume in docker-compose.
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    CHROMIUM_NO_SANDBOX=1 \
    FONT_DIR=/app/backend/assets/fonts \
    STORAGE_DIR=/app/backend/storage \
    BACKUP_DIR=/app/backend/backups

WORKDIR /app
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=prod-deps /app/backend/node_modules backend/node_modules
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/backend/package.json backend/package.json
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/prisma backend/prisma
COPY --from=build /app/backend/assets backend/assets
COPY --from=build /app/backend/scripts/fetch-fonts.mjs backend/scripts/fetch-fonts.mjs

WORKDIR /app/backend
# The copied fonts must still match their pinned hashes (no network).
RUN node scripts/fetch-fonts.mjs --verify \
 && mkdir -p storage backups && chown node:node storage backups
COPY --chmod=755 backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# The process runs as `node`, not root: the entrypoint fixes volume ownership
# and drops privileges (runuser) before starting the command.
ENTRYPOINT ["docker-entrypoint.sh"]
EXPOSE 4000
CMD ["node", "dist/server.js"]
