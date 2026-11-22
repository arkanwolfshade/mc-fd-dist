# 0032. List the queue in the order families were called

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

Distribution's queue was listed by card number. That matches the order families arrived only if tickets are handed out in rising order and the front desk calls families in that order. If the front desk calls number 12 before number 9, the queue still lists 9 first, so the list does not show who has been waiting longest since being called.

A second screen is planned: a read-only queue display for a large screen in the distribution room. It has to agree with the Distribution tablet, so both need one order.

## Decision

- **A call order on the card:** A card has a nullable `called_order` column, the family's place in the order the shift's families were called: 1, 2, 3 and so on. The server sets it, as the next number in the shift, when a card first moves to **called**. It is a counter, not a clock time, so clock and time-zone problems cannot arise.
- **When it changes:** Confirming a call, and undoing a confirmation, keep a family's place. Undoing the call (back to **entered**) and **left without food** clear it, and calling that family again puts them at the back.
- **Both screens use it:** The Distribution tablet and the queue display list families in `called_order`. `distributionQueue` in `client/src/state.ts` does the sorting, so both share it.
- **Cards called before this release:** They have no number. They were called before any that have one, so they come first, by card number.
- **No history:** The number is not renumbered when a family is served, so a gap is normal. The order matters, not the values.

## Alternatives considered

- **Keep card-number order:** No schema change, but the queue can differ from the order families were called in.
- **Store the time a card was called:** It shows how long a family has waited, but it depends on the server clock, and the order is all the screens need.
- **Change only the new display:** The tablet and the display would list the same queue differently.

## Consequences

- Migration 7 adds one column. The app is not yet in use, so there are no cards to leave without a number except those in a test or demo shift.
- The card carries one more field in the API, the live feed and the client's saved copy of the shift.
- A card waiting to send has no server ID, cannot be called, and so has no number.
- An earlier version of the app refuses a database with this migration (see `docs/developer/operations.md`), so going back after release means restoring the backup taken before it.
