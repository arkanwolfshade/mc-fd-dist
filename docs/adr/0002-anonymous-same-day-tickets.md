# 0002. Treat Card # as an anonymous same-day ticket

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

The MC-FD and MC-Dist sheets number rows 1 to 200 and record no names or addresses. The food bank confirmed that cards are handed out in arrival order and reused each shift.

## Decision

Card # identifies a ticket within one shift only. The system stores no names, addresses or household records, and a card number is unique per shift, not globally.

## Alternatives considered

- **Permanent household numbers:** Would allow visit history and repeat-visit reports, but makes the data linkable to real people and raises access-control, retention and privacy requirements.
- **Tickets linked to a separate registration record:** Would add reconciliation work with no current need.

## Consequences

Privacy risk and the size of the build both stay small. Reports can only cover totals per shift or date range. Per-household reporting is not possible without a new decision and new privacy safeguards.
