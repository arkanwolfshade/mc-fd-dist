# 0008. Commit directly to main until the app is in use

- **Status:** Superseded by 0028
- **Date:** 2026-11-06

## Context

The project has one developer and no users yet. A branch and pull request for each step was considered, and the developer chose less ceremony during early development.

## Decision

Commit directly to `main` using Conventional Commits. CI runs the typecheck and tests on each push, but it reports problems and does not block anything.

Revisit this decision before the volunteer dry run. From that point, a bad commit could disrupt a live shift.

## Alternatives considered

- **Pull request per step, with CI required and human review:** Recommended during planning, as it provides a review gate, but work waits on each merge.
- **Agent merges its own pull requests once CI passes:** Faster, but provides no review before changes reach `main`.

## Consequences

Fast iteration with a simple history. Nothing reviews a change before it lands, so broken commits can reach `main`, and CI only reports them afterward. This trade-off is acceptable only while no one depends on the app.
