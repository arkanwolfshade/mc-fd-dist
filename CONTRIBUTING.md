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

## Signed commits

GitHub rejects a push to `main` that contains a commit it cannot verify ([ADR 0025](docs/adr/0025-require-signed-commits.md)). Set signing up once on each machine that commits:

```sh
git config --global user.signingkey <your key ID>
git config --global commit.gpgsign true
```

Then add the matching public key to your GitHub account (Settings, SSH and GPG keys), with the email you commit with verified on the account. To check a commit, run `git log --show-signature -1`. On GitHub it shows as Verified.

The maintainer's key expires on 2027-11-12. Before then, extend it with `gpg --quick-set-expire <fingerprint> 1y`, and again for the subkey, then delete the key on GitHub and add the exported public key again: GitHub only picks up a new expiry that way. Commits already verified stay verified.

## Tests

- Write a failing test before changing behavior, and watch it fail for the expected reason.
- Before each commit, run `npm run format:check`, `npm run lint`, `npm run typecheck` and `npm run test:coverage`. Run `npm run test:e2e` too when a change affects the screens. `npm run format` fixes formatting.
- Add an end-to-end test for anything a person does across stations or screens. Unit tests cannot catch a browser refusing a form or a station missing an update.
- CI runs these on every push, along with the security scans listed in [ADR 0016](docs/adr/0016-code-health-checks.md). A finding blocks the build. If a rule truly does not apply, turn it off where it applies and say why, rather than ignoring it.
- Pin any new GitHub Action or scanner image to a full commit or digest, with the version in a comment.

## Decisions

Add an [architecture decision record](docs/adr/README.md) in the same commit as any change that is hard to reverse, affects several parts of the system, or rejects an obvious alternative.

## Data

Never add names, addresses or other personal details without a new decision record. Families stay anonymous (see [ADR 0002](docs/adr/0002-anonymous-same-day-tickets.md)). The only personal data held is each intake volunteer's initials (see [ADR 0024](docs/adr/0024-intake-initials.md)).

Never commit secrets, real passwords or database files.
