# 0017. Protect main with branch rulesets

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

Changes are committed straight to main (ADR 0008), and Dependabot now opens pull requests (ADR 0016). Nothing on GitHub stopped main from being force-pushed or deleted, or stopped a pull request from merging with failing checks.

## Decision

Two rulesets apply to the default branch. Their definitions are kept in `.github/rulesets/` and imported in the repository's settings.

- **Protect main:** blocks force-pushes and deletion. Nobody can bypass it.
- **Pull requests need CI:** requires the `check`, `container` and `secrets` jobs to pass. Repository admins can bypass it, which is what still allows direct commits under ADR 0008.

`.github/CODEOWNERS` names the maintainer as owner of everything, so that GitHub asks them to review every pull request.

## Alternatives considered

- **Require pull requests for every change now:** The safer end state, but it replaces ADR 0008 before the volunteer dry run, which is when that decision is due to be revisited.
- **Require signed commits:** Worth adding, but every machine that commits needs signing set up first.

## Consequences

- History on main can no longer be rewritten or lost by mistake.
- A direct push by an admin can still land with failing CI. The local hooks are the only check before it.
- When ADR 0008 is revisited, add a pull request rule and remove the admin bypass.
- The ruleset files in the repository are not applied automatically. Re-import them after editing.
