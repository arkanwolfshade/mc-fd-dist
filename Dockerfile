# Builds on the CI runner rather than the server, which is too small to compile comfortably.
FROM node:24.22.1-bookworm-slim AS build
# npm compiles better-sqlite3 from source, which needs these. Only this stage has them.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24.22.1-bookworm-slim
# Links the published package to the repository on GitHub.
LABEL org.opencontainers.image.source=https://github.com/arkanwolfshade/mc-fd-dist
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/mc-fd-dist.db \
    CLIENT_DIR=/app/dist/client \
    TRUST_PROXY=true
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Named volumes copy this ownership when they are first created.
RUN mkdir -p /data/backups && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/server/main.js"]
