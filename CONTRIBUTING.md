# Contributing

## Workflow

- Commit to `main` for now (see [ADR 0008](docs/adr/0008-commit-to-main-until-in-use.md)). This changes before the volunteer dry run.
- Use [Conventional Commits](https://www.conventionalcommits.org/), for example `feat: add card entry form` or `fix: correct TEFAP count at nine people`.
- Keep each commit to one logical change.

## Git hooks

`npm install` sets up hooks with husky:

- **Before each commit:** formats and lints the staged files, then scans the staged changes for secrets with [gitleaks](https://github.com/gitleaks/gitleaks).
- **Before each push:** runs the type checks and unit tests.

gitleaks is not an npm package, so install it separately (on Windows, `winget install Gitleaks.Gitleaks`). Without it the commit hook warns and skips the secret scan, and CI catches secrets only after they reach GitHub.

## Tests

- Write a failing test before changing behavior, and watch it fail for the expected reason.
- Before each commit, run `npm run format:check`, `npm run lint`, `npm run typecheck` and `npm run test:coverage`. Run `npm run test:e2e` too when a change affects the screens. `npm run format` fixes formatting.
- Add an end-to-end test for anything a person does across stations or screens. Unit tests cannot catch a browser refusing a form or a station missing an update.
- CI runs these on every push, along with the security scans listed in [ADR 0016](docs/adr/0016-code-health-checks.md). A finding blocks the build. If a rule truly does not apply, turn it off where it applies and say why, rather than ignoring it.
- Pin any new GitHub Action or scanner image to a full commit or digest, with the version in a comment.

## Decisions

Add an [architecture decision record](docs/adr/README.md) in the same commit as any change that is hard to reverse, affects several parts of the system, or rejects an obvious alternative.

## Data

Never add names, addresses or other personal details without a new decision record. The system is designed to hold no personal data (see [ADR 0002](docs/adr/0002-anonymous-same-day-tickets.md)).

Never commit secrets, real passwords or database files.
