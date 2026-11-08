# 0012. Define shift totals in one shared calculation

- **Status:** Accepted; amended by [0019](0019-correcting-unserved-cards.md), which excludes families who left without food
- **Date:** 2026-11-06

## Context

The Totals table on MC-Dist needs clear rules now that Door Dash and Helping Hands batches and returned items are separate from cards. The live summary and later reports must never disagree. Volunteers can also forget to enter a weight, which would quietly lower the totals.

## Decision

Totals are calculated by one pure function shared by client and server.

- **Families:** Each card counts as one family, plus the family counts of partner batches. The split between the two is shown.
- **Weight:** Card loads plus partner batch weights, with the split shown.
- **Returned weight:** Reported on its own, and subtracted only in a separate net weight line.
- **TEFAP bags, senior boxes and cheese:** Counted from cards only.
- **All entered cards count,** whatever their status.
- **Missing weights:** Marking a card distributed with no weight asks for a one-tap confirmation, and the summary shows how many distributed cards have no weight. A typed zero counts as a weight.

## Alternatives considered

- **Totals from cards only:** Clean on-site counts, but anyone wanting a grand total must add it up.
- **Requiring a weight:** More reliable totals, but it blocks a volunteer when the scale is down.
- **No weight check:** Fastest, but forgotten weights would go unnoticed.

## Consequences

One headline figure, with the breakdown still visible. This assumes partner family counts are real families served, and that a card entered but never distributed still counts as a family. Both assumptions should be confirmed with staff, particularly if these figures go to a funder.
