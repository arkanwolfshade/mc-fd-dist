# Contributing

## Workflow

- Commit to `main` for now (see [ADR 0008](docs/adr/0008-commit-to-main-until-in-use.md)). This changes before the volunteer dry run.
- Use [Conventional Commits](https://www.conventionalcommits.org/), for example `feat: add card entry form` or `fix: correct TEFAP count at nine people`.
- Keep each commit to one logical change.

## Tests

- Write a failing test before changing behavior, and watch it fail for the expected reason.
- Run `npm test` and `npm run typecheck` before each commit.
- CI runs both on every push.

## Decisions

Add an [architecture decision record](docs/adr/README.md) in the same commit as any change that is hard to reverse, affects several parts of the system, or rejects an obvious alternative.

## Data

Never add names, addresses or other personal details without a new decision record. The system is designed to hold no personal data (see [ADR 0002](docs/adr/0002-anonymous-same-day-tickets.md)).

Never commit secrets, real passwords or database files.
