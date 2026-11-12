# 0020. Follow the food bank's own process and words

- **Status:** Accepted; amended by [0023](0023-partner-families-carts-and-extras.md), which changes more wording and adds partner methods
- **Date:** 2026-11-08

## Context

Reviewing a design mock-up, the developer described how shifts actually run, and several screens did not match:

- Cheese is handed out only with a senior box.
- The front desk "calls back" a family to distribution over the radio, and distribution answers by confirming the card number and details.
- "AC" on the paper sheet meant "Around corner", a parking area. It was abbreviated only to fit the paper.
- The front desk's "Other" note was easy to miss on distribution's card.
- "Left without food" is an end-of-shift correction, not something to offer on every card during the shift.

## Decision

- **Cheese:** The server refuses a card, or a correction, that has cheese without a senior box. On screen, Cheese is unavailable until Senior box is ticked, and unticking Senior box clears it.
- **Call back:** The front desk's button reads "Call back", its undo "Undo call back", and the status "called back". Distribution's Confirm is the answer to that call. The stored status stays `called`.
- **Around corner:** The arrival method is still stored as `AC`, and shown as "Around corner" on every screen and in the cards CSV.
- **Note from the front desk:** The "Other" text appears on distribution's card as its own highlighted line, "Note from the front desk".
- **Left without food:** Offered only in the closing warning, not on the queue cards (amending ADR 0019).

*Amended 2026-11-11:* the food bank asked for more of its own words ([ADR 0023](0023-partner-families-carts-and-extras.md)). "Arrived by" became "Location or transport", "Load" became "Cart", and "Family" and "Senior Box" take capitals. Door Dash (`DD`) and Helping Hands (`HH`) joined the stored arrival methods, for partner cards entered by Distribution only.

## Alternatives considered

- **Renaming the stored values** (`called` to `called_back`, `AC` to a longer code): Clearer in the database, but it would need another table rebuild and gain nothing for anyone using the screens or reports.
- **Fixing cheese only on screen:** Simpler, but the server would still accept bad data from an outdated device or a queued write.

## Consequences

- The screens use the words volunteers already use on the radio and on paper.
- Old screenshots, guides and the demo had to change with them, and did.
- A card queued during an outage with cheese and no senior box would now be refused when sent. The screens already prevent creating one.
