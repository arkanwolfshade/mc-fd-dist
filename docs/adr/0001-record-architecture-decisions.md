# 0001. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

This app will be maintained by one developer for a food bank, and may need to pass to someone else. A successor needs to know why things are the way they are, not only what the code does.

## Decision

Keep architecture decision records in `docs/adr`, using the format in `template.md`. Add or supersede a record in the same commit as the change it describes.

## Alternatives considered

- **Comments and commit messages only:** The reasoning is scattered and hard to find later.
- **A single design document:** It tends to drift and does not preserve why a decision changed.

## Consequences

Decisions stay findable and their history is preserved. Each significant decision takes a few extra minutes to write up.
