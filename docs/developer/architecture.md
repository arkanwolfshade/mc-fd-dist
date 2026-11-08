# Architecture
**Version 1.0.0** · mc-fd-dist · 2026-11-08 · For developers

---

## AI READING INSTRUCTION

Read `[SPEC]` and `[BUG]` blocks for authoritative facts about how the system is built.
Read `[NOTE]` only if the reasoning behind a design is needed; the ADRs in `docs/adr/` hold the full reasoning.
`[?]` blocks are unverified or untested. Check them before relying on them.

---

## 1. Overview

**[SPEC]**
- One server, one SQLite database, and an installable web app used by every station.
- Stations write over HTTP and listen for changes on one WebSocket per station.
- No personal data is stored. A card number is an anonymous same-day ticket (ADR 0002).

| Part | Technology | Where |
|---|---|---|
| Server | Node.js 26, TypeScript 7, Fastify 5 | `server/` |
| Database | SQLite through better-sqlite3, WAL mode | `server/db.ts` |
| Client | Preact, built with Vite | `client/` |
| Offline support | Service worker and a write queue in `localStorage` | `client/public/sw.js`, `client/src/outbox.ts` |
| Hosting | Docker Compose behind Caddy, on AWS Lightsail | `deploy/` |

**[NOTE]**
The app replaces two paper sheets, MC-FD and MC-Dist. The design favours one small server that a single maintainer can understand completely over anything distributed. See ADRs 0004 to 0006.

---

## 2. Server modules

**[SPEC]**
Each server module and what it is responsible for:

| Module | Responsibility |
|---|---|
| `app.ts` | Builds the Fastify app: security headers, sign-in, the live socket, route registration, overnight auto-close |
| `accounts.ts`, `sessions.ts` | Accounts with Argon2 password hashes; session tokens stored as hashes |
| `cards.ts`, `card-routes.ts` | Cards, their status path, revisions and live broadcasts |
| `batches.ts`, `batch-routes.ts` | Returned items and Door Dash or Helping Hands batches |
| `admin-routes.ts` | Shift reports, CSV exports, accounts, activity log |
| `rules.ts` | TEFAP bags, arrival methods, allowed status changes by role |
| `summary.ts` | `shiftSummary`, the one calculation of shift totals (ADR 0012) |
| `shift-closing.ts` | Closing shifts by hand and automatically overnight (ADR 0013) |
| `audit.ts`, `csv.ts` | Activity log and spreadsheet-safe CSV |
| `backup.ts`, `cli/` | Verified backup and restore, and account creation |
| `db.ts` | Opens the database and applies migrations in order |

---

## 3. Data model

**[SPEC]**
The tables and what each holds:

| Table | Holds |
|---|---|
| `account` | Username, Argon2 hash, role (`front_desk`, `distribution`, `admin`) |
| `session` | Hash of the session token, account, expiry |
| `shift` | Date (unique), status (`open`, `closed`), whether it was reopened |
| `card` | Shift, number (unique per shift), family size, arrival method, senior box, cheese, other, TEFAP bags and override, status, up to three loads, revision, client ID |
| `partner_batch` | Shift, partner, family count, weight, client ID |
| `returned_batch` | Shift, weight, client ID |
| `audit_log` | Time, actor (station or admin username), action, detail |

**[SPEC]**
- Migrations live in `MIGRATIONS` in `server/db.ts`. Each entry's position is its schema version, stored in `user_version`.
- Never edit or reorder a released migration. Add a new one.
- SQLite cannot change a CHECK constraint, so changing one means rebuilding the table, as migration 5 does for `card`.

---

## 4. How a change moves between stations

**[SPEC]**
1. A station sends a write over HTTP, for example `PATCH /api/cards/:id` with the card's current `revision`.
2. The server checks the role and the status path, applies the change, increments the revision and records it in the activity log.
3. The server broadcasts the new card to every open socket whose session is still valid.
4. Each station merges the card, keeping the higher revision.

**[SPEC]**
- A write with an old revision gets `409` and the current card. The station shows it and asks the volunteer to review.
- Records are created with a client-generated `clientId`. Repeating a create returns the existing record, so retries never duplicate.
- Status moves one step at a time: entered, called, confirmed, distributed (ADR 0010).
- Off that path, distribution or an admin can record "left", left without food, on any card not yet distributed. Admins can delete a card while its shift is open (ADR 0019).

---

## 5. Offline behaviour

**[SPEC]**
- The service worker keeps the app's own files for offline use. It never handles `/api`.
- Writes go through the outbox (`client/src/outbox.ts`). It sends in order and keeps writes in `localStorage` per login while the connection is down.
- Later queued changes to a card are rebased on the revision returned by the earlier one.
- Network errors, 5xx, 408 and 429 retry later. 401 keeps the queue and signs out. Other 4xx drop the write and report it on screen.
- Stations resync when the socket opens, when the browser comes back online, and every 30 seconds.
- An answer for a day that has already ended is discarded, so a late resync near midnight cannot bring back yesterday's shift.

**[NOTE]**
ADR 0014 records the reasoning and the trade-offs, including what is lost if a device is wiped during an outage.

---

## 6. Security

**[SPEC]**
- Passwords: Argon2. Session tokens are stored only as hashes.
- Cookies: `HttpOnly`, `SameSite=Strict`, `Secure` in production.
- Sessions: shared role logins last 90 days; named admin logins last 12 hours (ADR 0007).
- Sign-in is rate-limited to 10 attempts a minute per address.
- Changing a password ends that account's sessions and closes its sockets with code 4401.
- Every response carries a content security policy, `nosniff`, `no-referrer`, frame denial, a permissions policy and cross-origin isolation. HSTS is added when running behind HTTPS.
- API responses are `Cache-Control: no-store`.
- CSV exports escape values that a spreadsheet would treat as formulas.

**[NOTE]**
`SECURITY.md` explains how to report a vulnerability. ADR 0016 lists the scans CI runs on every change.

---

## 7. Known limits

**[?]**
- Install and offline behaviour on real iPhones, iPads and Android devices has not been tested.
- The $5 server (0.5 GB) has been measured only in CI: the app used about 45 MB and Caddy about 11 MB. Docker and Ubuntu were not measured, and nothing has been load-tested.
- Two tabs signed in as the same station on one device would each keep their own queue and overwrite each other's saved copy.
