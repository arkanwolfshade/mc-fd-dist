# 0039. Require a positive weight for every cart, and show stops in red

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

ADR 0023 made cart weights required, with an exception: a warning named the carts without a weight and offered **Mark distributed anyway**. A weight of 0 counted as a weight. The food bank now asks that every distributed cart, and every returned item, has a weight above 0.

The yellow box that carried that warning also carries the extras check, which can still be overridden. A volunteer who learns that yellow means "you may go on" would look for a way past a rule that has none.

## Decision

- **Every cart is weighed:** A card is distributed only when each cart it gets has a weight above 0. The server refuses the change otherwise, naming the carts: "Weigh cart 2, then mark the Family distributed". The same holds for a partner Family, which is saved as distributed ("…then add the partner Family"), and for any later change to a distributed card, so a weight can't be cleared from a Family already served.
- **Weights are above 0:** The API refuses a cart weight of 0 or less. Returned weights were already refused at 0 (`exclusiveMinimum` and the table's check); the station now says so before the write is queued.
- **Red stops, yellow asks:** A stop, something that must be done before going on, is shown in red (the alert colors) and says what to do next, with no way past it. A warning that may be gone past stays yellow with **Go back** and an "anyway" button. Extras not ticked stays a warning. The same rule applies to later stops, such as closing a shift with cards still waiting (ADR 0040).
- **No database change:** The cart columns keep `CHECK (load >= 0)`. Changing a check means rebuilding the table, and the API is the only writer.

## Alternatives considered

- **Keep the warning with its exception:** Fewer blocked volunteers, but the food bank asked for the rule, and the totals would still need a "distributed without weight" flag.
- **Disable Mark distributed until every cart is weighed:** Quieter, but a disabled button can't explain itself to a screen reader, and tapping it shows nothing.
- **Keep the yellow box, without the anyway button:** No new color rule, but yellow would mean both "you may go on" and "you may not".

## Consequences

- Every distributed card counts toward the weight totals. The totals' "distributed without weight" note can now appear only for cards distributed before this change.
- A card distributed before this change without a weight can't be changed again until its carts are weighed. Admins correcting old shifts will see the message.
- Red now appears in ordinary use, whenever a weight is forgotten. If volunteers find it alarming, soften the red; don't make stops yellow.
