# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Shift tracker for a food bank: replaces the paper MC-FD (front desk) and MC-Dist (distribution)
sheets with one live record shared by both stations. Not yet in use; commits go straight to
`main` (ADR 0008; ADRs are the architecture decision records in `docs/adr/`) with Conventional Commit messages, one logical change each.

## Commands

```sh
npm test                                  # all unit tests (Vitest)
npx vitest run server/cards-routes.test.ts   # one test file
npx vitest run -t "part of a test name"   # tests by name
npm run test:coverage                     # what CI runs; thresholds must not fall
npm run typecheck                         # server, client and e2e tsconfigs
npm run lint                              # Oxlint --deny-warnings (type-aware)
npm run format:check                      # Prettier; `npm run format` fixes
npm run test:e2e                          # vite build, then Playwright
npx playwright test e2e/shift-flow.spec.ts -g "name"   # one e2e test (run `npx vite build` first)
npm run docs:check                        # HADS format, links, pictures in docs/
```

Before committing, run format:check, lint, typecheck and test:coverage; add test:e2e when a
screen changes. The pre-commit hook formats/lints staged files and runs gitleaks; the pre-push
hook runs typecheck and unit tests.

Local run: `npm run account -- pat admin` (password from stdin), then
`COOKIE_SECURE=false npm run dev` and `npm run dev:client` in a second terminal.

## Architecture

- **One Fastify server + one SQLite file + one installable Preact web app.** Server in
  `server/`, client in `client/src/` (Preact, built by Vite with root `client/`).
  `docs/developer/architecture.md` has the module table and data model.
- **Client and server share rules code.** The client imports `server/rules.ts` and
  `server/summary.ts` at runtime so TEFAP (The Emergency Food Assistance Program) bags, cart counts, status permissions and shift
  totals are computed by the same code on both sides. Every other client import from
  `server/` must be `import type` — server modules pull in Node-only deps.
- **ECMAScript modules (ESM), with `.js` import suffixes** in TypeScript source (`from "./rules.js"`).
- **Sync model:** stations write over HTTP and listen on one WebSocket each. Every card has a
  `revision`; a stale write gets `409` plus the current card. Creates carry a client-generated
  `clientId` so retries never duplicate. Status moves one step at a time (entered → called →
  confirmed → distributed), plus "left without food" and admin delete (ADRs 0010, 0019).
- **Offline:** writes queue in `client/src/outbox.ts` (localStorage, per login) and replay in
  order, rebasing on returned revisions. Network/5xx/408/429 retry; 401 keeps the queue and
  signs out; other 4xx drop the write and show it. The service worker (`client/public/sw.js`)
  caches app files only, never `/api`, and runs only in production builds.
- **Migrations** are the `MIGRATIONS` array in `server/db.ts`; position = schema version in
  `user_version`. Never edit or reorder a released one; changing a CHECK constraint means
  rebuilding the table.

## Testing

- Unit tests sit beside sources as `*.test.ts` under `server/`, `client/`, `tools/`. There is
  no DOM (document object model) test environment: `.tsx` screens are covered only by Playwright, so put decision
  logic in plain `.ts` modules (e.g. `client/src/state.ts`, `pending.ts`) and unit-test it there.
- Write the failing test first and watch it fail for the expected reason.
- Each e2e test starts its own server and in-memory database (`e2e/fixtures.ts`). Anything a
  person does across stations or screens needs an e2e test.
- Playwright's offline mode may not close an open WebSocket; use `signIn`'s `muteLive` option.
  `clock.fastForward` can hide races; delay the specific response with `page.route` instead.

## Conventions and constraints

- TypeScript 7: typescript-eslint does not support it, so linting is Oxlint + oxlint-tsgolint
  (`.oxlintrc.json`). Don't add ESLint. A disabled rule or skipped finding is recorded where it
  applies, with the reason.
- No personal data about Families — cards are anonymous same-day tickets (ADR 0002). The only
  personal data is intake initials (ADR 0024). Adding any needs a new ADR.
- Commits to `main` must be signed (ADR 0025). The maintainer's global git config signs by
  default, so never pass `--no-gpg-sign` or turn `commit.gpgsign` off to get past a failure;
  if signing fails, report it.
- Add an ADR (`docs/adr/`, see template) in the same commit as any hard-to-reverse or
  cross-cutting decision.
- Docs in `docs/guides/` and `docs/developer/` follow the HADS 1.0.0 documentation format from ADR 0018 (`[SPEC]`/`[NOTE]`/`[BUG]`/`[?]`
  blocks); `tools/hads.ts` checks them. When a screen changes, run `npm run docs:screenshots`
  and check the guides still match. Read `[BUG]` blocks in `docs/developer/development.md`
  before touching build, CI or deploy scripts.
- New `deploy/*.sh` files need `git update-index --chmod=+x` (Windows loses the flag).
- Pin new GitHub Actions and scanner images to a full commit/digest with the version in a comment.
