# eBookStudio web (Next.js standalone)
FROM node:24-bookworm-slim AS build
RUN npm install -g pnpm@11.13.1
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile --filter frontend...
COPY packages/shared packages/shared
COPY frontend frontend
# Rewrites are compiled into the build; nginx serves /api in Docker, this is the fallback.
ARG BACKEND_INTERNAL_URL=http://backend:4000
ENV BACKEND_INTERNAL_URL=$BACKEND_INTERNAL_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter frontend build

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /app/frontend/.next/standalone ./
COPY --from=build /app/frontend/.next/static ./frontend/.next/static
COPY --from=build /app/frontend/public ./frontend/public
EXPOSE 3000
CMD ["node", "frontend/server.js"]
