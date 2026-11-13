# Chainguard's free node images carry only the "latest" tags, so each is pinned by digest and
# Dependabot moves the digest (ADR 0027). The two stages must stay on the same Node major,
# because better-sqlite3 is compiled in the first and loaded by the second.
# Builds on the CI runner rather than the server, which is too small to compile comfortably.
FROM cgr.dev/chainguard/node:latest-dev@sha256:4b1b492b6e1ef2433e14caaf09df940a415a3da5315a1ec5a787defd8464b054 AS build
# The image's own user cannot install packages, and this stage is discarded: only files are
# copied out of it, never its user.
# hadolint ignore=DL3002
USER 0
# npm compiles better-sqlite3 from source. The image has make and g++; node-gyp also needs
# Python. Only this stage has them.
RUN apk add --no-cache python3
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
# The runtime image has no shell, so the data folder is made here. Named volumes copy this
# ownership when they are first created.
RUN mkdir -p /data/backups && chown -R 1000:1000 /data

FROM cgr.dev/chainguard/node:latest@sha256:013b80be7d1fe3b24bad520aa559b83ec2048896bbacc96e1885ce1a66903923
# Links the published package to the repository on GitHub.
LABEL org.opencontainers.image.source=https://github.com/arkanwolfshade/mc-fd-dist \
      org.opencontainers.image.licenses=MIT
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
COPY --from=build --chown=1000:1000 /data /data
# The base image starts "node" itself. Clearing that keeps "docker compose exec/run app node ..."
# in the deploy scripts working as they are.
ENTRYPOINT []
# Number 1000, as before, because the live data volume is owned by it. The base image's own
# "node" user is 65532. Numeric, so that hosts can check it isn't root.
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/server/main.js"]
