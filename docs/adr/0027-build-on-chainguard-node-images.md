# 0027. Build the app image on Chainguard's node images

- **Status:** Accepted
- **Date:** 2026-11-13
- **Corrected:** 2026-11-13. The first version said the runtime image has no shell, no npm and no standard tools. It has busybox's shell and tools, and npm.

## Context

The app image was built on Debian's `node:26.13.0-bookworm-slim`. It needed a step to apply Debian's security updates, because the base image lagged behind them, and a step to delete npm and corepack, because their own dependencies carry known vulnerabilities. The maintainer has a free Chainguard account and wanted a hardened base image.

Chainguard's free tier gives only the `latest` and `latest-dev` tags. Versioned tags and patch SLAs are paid. Both images are pulled without signing in. On 2026-11-13 `latest` was Node 26.13.1, which meets the `>=26.13.0` that `package.json` requires.

## Decision

Build on `cgr.dev/chainguard/node:latest-dev` and run on `cgr.dev/chainguard/node:latest`. Each is pinned by digest, and Dependabot's Docker updates move the digest. The build stage adds Python for node-gyp; the image already has make and g++.

The runtime image has a busybox shell and tools but no package manager, and it still carries npm and npx. The Dockerfile no longer removes npm or upgrades packages, because a scan of the finished image with Grype on 2026-11-13 reported no vulnerabilities. If a scan flags npm's own dependencies again, restore the removal step the old Dockerfile had.

The app still runs as user 1000, not the image's own `node` user (65532), because the live data volume is owned by 1000. The data folder is created in the build stage and copied with that ownership. The Dockerfile clears the image's `node` entrypoint, so `docker compose exec app node ...` in the deploy scripts works as before.

The deploy scripts are unchanged: busybox in the image supplies the `find`, `ls`, `id` and `touch` that they run in the app container. The `find -mtime +7 -delete` that prunes old backups was tested against the image on 2026-11-13.

## Alternatives considered

- **Stay on Debian slim:** works, but needs the update and removal steps and carries more packages for scanners to report.
- **Docker Hardened Images and distroless:** not tried; Chainguard was the maintainer's choice.
- **Chainguard's paid versioned tags:** would keep Node pinned by number, at a cost the food bank should not take on.

## Consequences

- The Node version is no longer chosen by us. A digest bump can move Node to a new minor or patch release, and Dependabot's pull request is the review point. The CI image checks, smoke test and end-to-end tests run on it before it can merge. If Chainguard ever makes `latest` a new major, `better-sqlite3` and `engines` must be checked before merging.
- The two stages' digests are bumped separately and must stay on the same Node major, because the native module is compiled in one and loaded in the other.
- Chainguard's free tier may stop serving old digests, so an old image cannot always be rebuilt. The published images in GHCR are the record of what ran.
- The server's data volume keeps its ownership. A move to the image's own user would need a one-time `chown` of the volume after a backup.
- The image has a shell and busybox's tools but no `apk`, so nothing can be installed in a running container. For more tools, use the `-dev` image.
