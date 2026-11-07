# 0006. Use SQLite with nightly backups

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Persistent storage is a requirement. The app runs on one small server (see 0005) with a few stations and about 200 cards per shift, and reports need SQL.

## Decision

Store data in SQLite in WAL mode on the server. Copy a verified backup to S3 nightly and keep daily Lightsail snapshots. Practice restoring before go-live and on a regular schedule.

## Alternatives considered

- **Postgres on the same server:** More capable and easier to move, but another service to patch and tune, for little benefit at this size.
- **Lightsail managed database:** Least operational work, but adds a meaningful monthly bill.
- **Continuous backup with Litestream:** Nearly no data loss, but one more moving part. Reasonable to add if the rollout shows the need.

## Consequences

One database file, simple restores and no database service to run. The app is limited to one server, and moving to several would need a migration. A disk failure could lose entries made since the last backup, including part of a live shift.
