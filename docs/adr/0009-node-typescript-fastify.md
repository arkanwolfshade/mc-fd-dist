# 0009. Use Node.js, TypeScript and Fastify on the server

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

The server needs HTTP, WebSockets, and SQLite access, and it shares types and rules with a web client. It runs on a small server and is maintained by one developer.

## Decision

Use Node.js with TypeScript, Fastify and better-sqlite3 on the server. Use Vite with Preact for the client. Use Vitest for tests, and write tests first for behavior. Hash passwords with Argon2.

These tools were proposed in the project plan and were not discussed in depth, so they may be revisited early at low cost.

## Alternatives considered

- **Python or Go on the server:** Both are workable, but a shared language with the client lets business rules such as the TEFAP calculation live in one place.
- **Express:** More familiar, but Fastify offers built-in schema validation and has maintained plugins for what this app needs.

## Consequences

One language across client and server. better-sqlite3 and Argon2 are native packages, so builds depend on prebuilt binaries or a compiler on the target platform. The container image must account for that.
