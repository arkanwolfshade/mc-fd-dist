# Contributing

## Workflow

- Work on a branch and open a pull request, then merge it with **Squash and merge**. The rulesets on `main` require this, along with signed commits and passing checks ([ADR 0017](docs/adr/0017-branch-rulesets.md), [ADR 0028](docs/adr/0028-change-main-only-through-pull-requests.md)). The administrator's bypass of the rulesets stays for repairing `main`, not for routine changes.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for the pull request title, which becomes the commit message, for example `feat: add card entry form` or `fix: correct TEFAP count at nine people`.
- Keep each pull request to one logical change.

## Git hooks

`npm install` sets up hooks with husky:

- **Before each commit:** formats and lints the staged files, then scans the staged changes for secrets with [gitleaks](https://github.com/gitleaks/gitleaks).
- **Before each push:** runs the type checks and unit tests.

Check that the hooks are installed with `git config core.hooksPath`, which should print `.husky/_`. If it prints nothing, run `npx husky`. Until then git runs no hooks at all, so a failing test or a formatting error is only found by CI.

gitleaks is not an npm package, so install it separately (on Windows, `winget install Gitleaks.Gitleaks`). Without it the commit hook warns and skips the secret scan, and CI catches secrets only after they reach GitHub.

## Signed commits

GitHub rejects a push to `main` that contains a commit it cannot verify ([ADR 0025](docs/adr/0025-require-signed-commits.md)). Set signing up once on each machine that commits:

```sh
git config --global user.signingkey <your key ID>
git config --global commit.gpgsign true
```

Then add the matching public key to your GitHub account (Settings, SSH and GPG keys), with the email you commit with verified on the account. To check a commit, run `git log --show-signature -1`. On GitHub it shows as Verified.

The maintainer's key expires on 2027-11-12. Before then, extend it with `gpg --quick-set-expire <fingerprint> 1y`, and again for the subkey, then delete the key on GitHub and add the exported public key again: GitHub only picks up a new expiry that way. Commits already verified stay verified.

Merge pull requests with **Squash and merge**. GitHub signs that commit, but not the commits that a rebase merge rewrites, which then land unsigned ([ADR 0025](docs/adr/0025-require-signed-commits.md)).

## Tests

- Write a failing test before changing behavior, and watch it fail for the expected reason.
- Before each commit, run `npm run format:check`, `npm run lint`, `npm run typecheck` and `npm run test:coverage`. Run `npm run test:e2e` too when a change affects the screens. `npm run format` fixes formatting.
- Add an end-to-end test for anything a person does across stations or screens. Unit tests cannot catch a browser refusing a form or a station missing an update.
- CI runs these on every push, along with the security scans listed in [ADR 0016](docs/adr/0016-code-health-checks.md). A finding blocks the build. If a rule truly does not apply, turn it off where it applies and say why, rather than ignoring it.
- Pin any new GitHub Action or scanner image to a full commit or digest, with the version in a comment.

## Releases

The maintainer cuts a release ([ADR 0029](docs/adr/0029-immutable-versioned-releases.md)). In the Actions tab, run **Release** from `main` with the version, for example `0.2.0`. It starts as a dry run that publishes nothing and shows the release notes. Run it again with **dry run** unticked to publish, which also starts a **Deploy** for that version that waits for the maintainer's approval. A published release and its version can never be changed or reused, so check the dry run first.

## Decisions

Add an [architecture decision record](docs/adr/README.md) in the same commit as any change that is hard to reverse, affects several parts of the system, or rejects an obvious alternative.

## Data

Never add names, addresses or other personal details without a new decision record. Families stay anonymous (see [ADR 0002](docs/adr/0002-anonymous-same-day-tickets.md)). The only personal data held is each intake volunteer's initials (see [ADR 0024](docs/adr/0024-intake-initials.md)).

Never commit secrets, real passwords or database files.

## License

By contributing you agree that your work is licensed under the [MIT license](LICENSE) that covers the project.
