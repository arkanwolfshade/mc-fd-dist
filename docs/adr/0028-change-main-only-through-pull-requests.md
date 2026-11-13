# 0028. Change main only through pull requests

- **Status:** Accepted
- **Date:** 2026-11-13
- **Supersedes:** 0008

## Context

ADR 0008 had the developer commit straight to `main` while the app had one developer and no users, and said to revisit that before the volunteer dry run. Since then the repository has gained rulesets that require a pull request, signed commits and passing checks (ADRs 0017 and 0025), and the three Codacy checks (2026-11-13).

In practice, direct commits continued until the morning of 2026-11-13. From pull request 10 on, every change has been a pull request, squash-merged. The written rule and the practice had drifted apart, and the app is moving towards use at the food bank, where a bad commit on `main` can reach a live shift.

## Decision

Every change reaches `main` through a pull request, merged with **Squash and merge** once the required checks pass. The pull request title is a Conventional Commit message and becomes the commit on `main`, which GitHub signs.

The rulesets enforce this. Repository administrators can still bypass them. That is kept for repairing `main` or the rulesets themselves, not for routine changes.

## Alternatives considered

- **Keep ADR 0008:** the checks would stay advisory, and the documents would keep describing a practice that has stopped.
- **Remove the administrator bypass now:** ADR 0017 said to do this when ADR 0008 was revisited. It is not done here. The code owner is the only maintainer, and GitHub does not let someone approve their own pull request, so without the bypass the code owner's review rule would block every merge until a second reviewer exists or that rule is dropped. Revisit it when a second maintainer joins.
- **Let an assistant merge its own pull requests once CI passes:** faster, but nobody reviews the change. The maintainer merges.

## Consequences

- Every change is seen by CI and Codacy before it lands, and each one has a place for review and a short written reason.
- Small fixes cost a branch and a pull request. This is accepted.
- The bypass still allows an unchecked commit to land. The local hooks (formatting, linting, a secret scan, type checks and unit tests) are the only check before it.
- `CONTRIBUTING.md`, `docs/developer/development.md` and `CLAUDE.md` describe this workflow.
