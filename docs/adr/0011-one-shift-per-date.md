# 0011. Allow one shift per date

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Cards are grouped into shifts, and card numbers are reused each shift (see 0002). The food bank needs to decide how shifts map to calendar dates, and whether to limit card numbers.

## Decision

Each date has exactly one shift, enforced by the database. A card number is unique within its shift. Card numbers have no upper limit for now, which is the easiest choice to tighten later.

## Alternatives considered

- **Several shifts per date:** Handles separate morning and evening services, but allows accidental duplicates and complicates shift selection.
- **Capping card numbers at 200:** Catches typing mistakes immediately, but blocks entry if more cards are ever used. The real limit is unconfirmed.

## Consequences

Reports and shift selection stay simple, and a second station cannot accidentally open a duplicate shift. Separate services on one date would need a schema change. A mistyped high card number is accepted.
