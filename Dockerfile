FROM oven/bun:1.4.0 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN bun install --frozen-lockfile
COPY apps ./apps
COPY db ./db
COPY tsconfig.json ./
RUN bun run typecheck && bun run test && bun run build:web

FROM oven/bun:1.4.0 AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 DATABASE_PATH=/app/data/status.sqlite
COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN bun install --production --frozen-lockfile --filter @router-status/server
COPY --from=build /app/apps/server/src ./apps/server/src
COPY --from=build /app/db ./db
COPY --from=build /app/apps/web/dist ./apps/web/dist
RUN mkdir -p /app/data && chown bun:bun /app/data
USER bun
EXPOSE 8787
CMD ["bun", "apps/server/src/index.ts"]
