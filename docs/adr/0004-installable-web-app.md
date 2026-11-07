# 0004. Build one installable web app for all platforms

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

The app must run on Windows, macOS, iOS and Android at minimal cost, and will be maintained by one developer.

## Decision

Build a single progressive web app that can be installed on each platform. Queue writes on the device during brief Wi-Fi dropouts and sync them on reconnect, with client-generated IDs so that retries are safe.

## Alternatives considered

- **Native or cross-platform store apps:** Add app store fees, review delays and per-platform release work, with no feature this app needs in return.

## Consequences

One codebase and no app store accounts or fees. HTTPS is required, so the deployment needs a domain name. Install and background behavior on iOS must be tested early on real devices. During a longer outage, the stations cannot see each other's new entries and fall back to paper.
