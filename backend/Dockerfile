# eBookStudio API + worker (same image, different command)
FROM node:24-bookworm-slim

# Chromium + Noto fonts for PDF rendering (Latin, Bengali, Devanagari, Tamil, Arabic, Urdu, CJK…)
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-noto-core fonts-noto-extra fonts-noto-cjk ca-certificates wget \
 && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production
RUN npm install -g pnpm@11.13.1

WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/prisma.config.ts backend/
COPY backend/prisma backend/prisma
RUN pnpm install --frozen-lockfile --filter backend... --prod=false

COPY packages/shared packages/shared
COPY backend backend
# Interior fonts: vendored files are verified; CJK faces are downloaded and SHA-256 checked (build fails on mismatch).
RUN node backend/scripts/fetch-fonts.mjs
RUN pnpm --filter backend build

WORKDIR /app/backend
RUN mkdir -p storage
EXPOSE 4000
CMD ["node", "dist/server.js"]
