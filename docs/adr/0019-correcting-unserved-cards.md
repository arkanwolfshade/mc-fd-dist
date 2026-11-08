# 0019. Correct unserved cards by recording them as left, or by deleting them

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

Staff confirmed that a card entered but never served counts as a family, but that at the end of a shift it is an error to be corrected. Closing a shift now lists such cards. The app had no way to correct them: a card could only move along the path from entered to distributed (ADR 0010), and there was no way to remove one.

Two different errors need correcting: a family who left before being served, and a card that should never have existed, such as a duplicate or a typo.

## Decision

- **A new status, "left without food" (`left`):**
  - Distribution and admins can set it on any card that has not been distributed, from the queue or from the closing warning.
  - Undoing it returns the card to "entered", so that only the front desk can call the family forward again. Returning it straight to "called" would let distribution put a card in its own queue that the front desk never called.
  - It sits outside the single-step path of ADR 0010, and the front desk cannot set it.
- **Totals (amending ADR 0012):** A card that left counts on its own line, "Left without food", and is excluded from families, weight, TEFAP bags, senior boxes and cheese. The CSV report gains a `families_left` column.
- **Deleting a card:**
  - Admins only, with a confirmation, while the shift is open, and never queued during an outage.
  - The activity log keeps the deleted card's details, and every station removes the card live.
- **Closing:** Closing still lists every card not yet distributed or left, and still allows closing after confirmation.

The database's card table is rebuilt in migration 5, because SQLite cannot change a CHECK constraint.

## Alternatives considered

- **Deletion only:** Simpler, but it would erase families who came and left, which staff may want to know about.
- **Status only:** Duplicates and typos would stay in the record as families who left, which would be wrong.
- **Blocking the close until every card is corrected:** Safer for the figures, but it could trap a shift open when staff are not present to decide.

## Consequences

- At the end of a shift, every card can be made either distributed or left, so the totals describe what happened.
- The headline family count changes for any shift with families who left. Reports from before this change are unaffected, because no card could be marked left until now.
- Deleted cards are gone from reports. Only the activity log shows them.
- The admin screen's own **Close** button for a shift does not show the warning. Revisit if staff close shifts from there.
