# 0033. Add a read-only role for the wall display

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

The food bank wants a large display in the distribution room that shows the queue, so volunteers can see who is waiting without going to a tablet. The room has Families in it as well as volunteers. The app's only personal data is the intake initials (ADR 0024), and cards carry free-text notes and weights that a wall screen has no use for (ADR 0002).

Three things about the existing server made a "read-only" screen less simple than a new view:

- Most routes were open to any signed-in account. Opening a shift, listing cards, creating a card and editing a card were guarded by `requireRole()` with no roles, which meant everyone signed in. A new role would have been able to change cards.
- `GET /api/shifts` and the live socket send every card in full, to every role.
- `account.role` has a CHECK constraint, so a new role needs the table rebuilt. Dropping the old table would also delete every session through its `ON DELETE CASCADE`, which signs every station out.

## Decision

- **A fourth role, `display`:** One shared login for the wall screen, like the stations (ADR 0007). Its session lasts 90 days, like theirs, so about every three months the screen shows the sign-in form and someone signs it in again.
- **Closed by default:** Before any route runs, a request from a display session is refused with 403 unless its path is in `DISPLAY_ROUTES` in `server/display.ts`: sign-in and out, `/api/me`, `/api/health`, `/api/live` and `/api/display`. A route added later is closed to it until it is listed. This runs before validation, so it holds whatever the request carries. `canChangeStatus` also gives the role no statuses.
- **A trimmed copy:** `GET /api/display?date=` returns the shift and the families in the queue (called or confirmed, not partner Families), in call order (ADR 0032), with only the number, family size, location or transport, Senior Box, Cheese, TEFAP bags, status, call order and revision. On the live socket a display is sent that same trimmed card while a family is in the queue, and a "card gone" message when one leaves it, so it never holds details of a card it does not show. It hears of shifts opening and closing, and nothing about returned items.
- **Initials, notes and weights never reach the display:** the server leaves them out, not the screen, so they are not in its memory or its network traffic.
- **The migration keeps sessions:** The `account` table is rebuilt with the new role, with the sessions held in a temporary table and put back, so no station is signed out by the upgrade.
- **Creating one:** `npm run account -- <name> display`. The admin screen creates only admins, so a display account is a command-line task, like the station logins.

## Alternatives considered

- **Reuse the distribution login:** No migration, but the wall screen would hold a login that can edit and delete cards for 90 days, and "read-only" would be only how the screen looks.
- **A secret link with no sign-in:** Nothing to type on a screen with no keyboard, but a new kind of access outside ADR 0007, which cannot be revoked once the link is photographed or shared.
- **Full cards, with the screen not drawing the private fields:** Least code, but initials and notes would sit in the screen's browser, and a later edit could show them by accident.
- **Close each route with a guard in the route:** It is checked after validation, so a request with a bad body is refused for that, not for its role, and each new route has to remember to do it.

## Consequences

- An earlier version of the app refuses a database with this migration, so going back after release means restoring the backup taken before it.
- Every new `/api` route is closed to the display until it is listed. `server/display.test.ts` walks every route and fails when the count changes, so each new route is decided on purpose.
- A leaked or stolen display session can read the queue and nothing else, and changing the display's password ends it everywhere.
- The station screens are keyed by the roles that work a shift (`WorkingRole`). A display login that signs in before its screen exists is shown a notice saying so.
- Family size, Senior Box and Cheese are visible to anyone in the room who can see the wall. They are already on the tickets the Families hold.
