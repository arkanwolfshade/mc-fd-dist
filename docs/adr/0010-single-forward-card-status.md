# 0010. Move each card along a single status path

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

MC-FD has Callback and Confirmed ticks, and MC-Dist has Confirmed and Distributed ticks. On paper these can be marked in any order. Both stations need one clear live queue.

## Decision

Each card has one status: entered, called, confirmed, then distributed. It moves one step at a time, forward or back, so that mistakes can be corrected.

- The front desk moves a card between entered and called.
- Distribution moves a card between called, confirmed and distributed.
- An admin can make any single step.

Steps cannot be skipped by any role, and these rules are enforced on the server.

## Alternatives considered

- **Independent ticks, as on paper:** The most flexible, but allows odd combinations that the queue and reports would have to handle.

## Consequences

The queue and counts stay simple. Every family must be called before distribution can confirm them, so a family who goes straight to distribution needs one extra step. If the rollout shows this is common, revisit the rule.
