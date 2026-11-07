# 0003. Enter card details once and share them live

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Both paper sheets repeat family size, arrival method and box columns, so the same details are written twice. The stations also cannot see each other's work. A real-time link is a core requirement.

## Decision

The front desk enters a card once. Distribution sees it live, confirms or corrects it, adds up to three load weights, and marks it distributed. Returned items and Door Dash or Helping Hands batches are separate shift-level records, not card rows.

Because two stations can edit one card, each write carries a revision number. A stale write prompts a review instead of silently overwriting.

## Alternatives considered

- **Each station keeps its own record:** Preserves an independent cross-check, but keeps the double entry and adds mismatch handling.

## Consequences

Double entry goes away and totals are calculated automatically. Distribution loses its independent record of family size, arrival method and boxes, which the paper sheets may have provided as a cross-check. The parallel paper shifts in the rollout will show whether that matters.
