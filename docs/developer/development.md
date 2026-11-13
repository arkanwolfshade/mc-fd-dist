# Development
**Version 1.1.0** · mc-fd-dist · 2026-11-13 · For developers

---

## AI READING INSTRUCTION

Read `[SPEC]` and `[BUG]` blocks for authoritative facts about building, testing and changing the code.
Always read `[BUG]` blocks before changing the build, CI or deployment scripts.
Read `[NOTE]` only if additional context is needed.

---

## 1. Requirements

**[SPEC]**
- Node.js 26.13.0 or later (the current LTS release).
- gitleaks, for the commit hook's secret scan (`winget install Gitleaks.Gitleaks` on Windows).
- Chromium for Playwright: `npx playwright install chromium`.
- Docker is optional. CI builds and tests the container; build it locally only to debug it. In Git Bash on Windows, set `MSYS_NO_PATHCONV=1` first (see known pitfalls).

---

## 2. Getting started

**[SPEC]**
```sh
npm install                      # also installs the git hooks
npm run account -- pat admin     # create an admin; the password is read from standard input
COOKIE_SECURE=false npm run dev  # server on http://127.0.0.1:3000
npm run dev:client               # in a second terminal: the client, with hot reload
```

---

## 3. Commands

**[SPEC]**
The npm scripts:

| Command | Does |
|---|---|
| `npm test` | Unit tests (Vitest) |
| `npm run test:watch` | Unit tests, rerun on every change |
| `npm run test:coverage` | Unit tests with coverage thresholds |
| `npm run test:e2e` | Builds the client, then runs the browser tests (Playwright) |
| `npm run typecheck` | Type checks the server, client and tests |
| `npm run lint` | Oxlint, with type-aware rules |
| `npm run format` / `format:check` | Prettier |
| `npm run build` | Builds the server and client into `dist/`; the client build also writes `third-party-notices.txt` (ADR 0026) |
| `npm run demo` | Runs the side-by-side walkthrough. `DEMO_STEP_SECONDS` sets the pace |
| `npm run docs:screenshots` | Retakes the guide screenshots |
| `npm run docs:pdf` | Builds printable guides into `dist/guides/` |
| `npm run docs:check` | Checks HADS format, links and pictures |
| `npm run licenses:check` | Checks that every installed package has an allowed license (ADR 0026) |

---

## 4. Workflow

**[SPEC]**
- Write a failing test first and watch it fail, then make it pass (CONTRIBUTING.md).
- Work on a branch and open a pull request with a Conventional Commit title, and merge it with **Squash and merge**, the only method allowed (ADR 0028). The title becomes the commit message on `main`, which GitHub signs (ADR 0025).
- Two rulesets guard `main` (ADR 0017). One requires a pull request, signed commits, the code owner's review, clean CodeQL results and the three Codacy checks. The other requires the `check`, `container` and `secrets` jobs. Repository administrators can bypass both. That is kept for repairing `main`, not for routine changes. Their definitions are in `.github/rulesets/` and are applied by hand, so keep the files in step with the settings page.
- The commit hook formats and lints staged files and scans them for secrets. The push hook runs the type checks and unit tests.
- Add an ADR in the same commit as any decision that is hard to reverse or crosses parts of the system.
- When a screen changes, run `npm run docs:screenshots` and check the guides still describe it.

---

## 5. Continuous integration

**[SPEC]**
The CI jobs and what each runs:

| Job | Runs |
|---|---|
| `check` | Formatting, lint, types, documentation check, license check, unit tests with coverage, coverage upload to Codacy, `npm audit`, browser tests, PDF build |
| `container` | shellcheck, hadolint, cfn-lint, Checkov, image build, Grype, smoke test, OWASP ZAP baseline |
| `secrets` | gitleaks over the whole history |
| `publish` | Pushes the image to `ghcr.io` after the other jobs pass on `main` |
| CodeQL | Separate workflow: security analysis of the TypeScript and the workflows |

**[SPEC]**
The `check` job uploads coverage to Codacy:

- It reads the repository's Codacy token from the `CODACY` Actions secret. Where the secret cannot be read, as in Dependabot's runs, the step is skipped with a notice.
- A failed upload is a warning, not a failure, so that an outage at Codacy cannot hold up a release.
- It runs no downloaded script. It does not use Codacy's own action, which runs a script from Codacy's `master` branch, or Codacy's `get.sh`. A step with no secrets downloads the reporter binary from its GitHub release and checks it against a SHA-512 kept in `ci.yml`, and only then does the upload step get the token.
- To update the reporter, change the version and the hash together in `ci.yml`. The hash is in the release's `codacy-coverage-reporter-linux.SHA512SUM`.

**[SPEC]**
Dependabot (`.github/dependabot.yml`) covers these dependencies:

- Weekly, Sunday 03:00 Phoenix time, so no pull request arrives during a shift. It checks npm (`/`), the Dockerfile (`/`, which pins Chainguard's two node images by digest, ADR 0027), `deploy/compose.yaml` (`/deploy`, the Caddy and aws-cli images) and GitHub Actions (`/`).
- Minor and patch updates are one pull request per ecosystem. A major update is its own pull request. Titles are `chore(deps): ...`, or `ci: ...` for Actions.
- Dependabot rewrites a pinned action's commit and the version in the comment on the same line, so keep that comment on the `uses:` line.
- It cannot update the gitleaks image digest in `ci.yml`, the ZAP digest in `deploy/dast.sh` or the CloudFormation templates. Bump those by hand.
- Review and merge by hand with Squash and merge, which is the only method the repository allows, once CI passes. Nothing auto-merges.
- Dependabot security alerts and security updates are switched on in the repository settings, not in this file.

**[?]**
Dependabot has not yet been seen moving a `cgr.dev` digest in the Dockerfile. If it does not, bump both digests by hand and keep the two images on the same Node major, because `better-sqlite3` is compiled in one and loaded in the other.

**[SPEC]**
Codacy analyses every pull request and reads `.codacy.yaml` from the default branch. Each exclusion there says why. Its Lizard tool flags a function over 55 lines of code or with a complexity over 10, so keep functions small.

**[SPEC]**
The Deploy workflow (`.github/workflows/deploy.yml`) starts when CI passes on `main`. It is not part of CI. Section 4 of `docs/developer/operations.md` describes using it. It does this:

- It runs in the GitHub `production` environment, so a reviewer must approve it before the job starts.
- It then waits for a window outside shift hours, and fails at once if the window is more than 340 minutes away (ADR 0022).
- It checks that CI published the commit's image, applies the stack, and releases on the server.

**[SPEC]**
The Release workflow (`.github/workflows/release.yml`) is run by hand from `main` (ADR 0029):

- It takes a version such as `0.2.0`, and refuses one that is not higher than every existing `v` tag. The rules are in `tools/release-version.ts`.
- It takes the latest commit on `main`, or a full commit hash you give, and requires that CI passed for it and that its image carries this repository's build attestation.
- **Dry run** is ticked by default. It runs every check, builds the SBOM and shows the release notes in the job summary, and publishes nothing.
- Unticked, it creates a draft release with `image.txt` (the image's name by digest) and `sbom.spdx.json`, adds the version tag to the image, publishes the release and verifies it with `gh release verify`. Publishing makes the tag and files permanent.
- To check a release yourself: `gh release verify v0.2.0`, and `gh attestation verify oci://<image from image.txt> --repo arkanwolfshade/mc-fd-dist`.

**[NOTE]**
Findings from Grype, hadolint and ZAP are written as annotations, because the job logs need a signed-in GitHub session and the annotations do not.

---

## 6. Documentation

**[SPEC]**
- Guides and developer docs follow HADS 1.0.0: a title, a version line, an AI reading instruction, then `[SPEC]`, `[NOTE]`, `[BUG]` and `[?]` blocks.
- Volunteer guides live in `docs/guides/<language>/`. Pictures live in `docs/guides/images/`.
- The Help tab and the PDFs remove the AI reading instruction and block tags, and show `[BUG]` blocks as "Problem, What you see, Why, What to do".
- `tools/hads.ts` checks the format. Unlike the reference validator, it also checks titled `[BUG]` blocks.

---

## 7. Known pitfalls

**[BUG] typescript-eslint cannot lint this project**
Symptom: Installing typescript-eslint fails with a peer dependency error.
Cause: typescript-eslint supports TypeScript only below 6.1, and this project uses TypeScript 7.
Fix: Lint with Oxlint and oxlint-tsgolint, as configured in `.oxlintrc.json`. Revisit when typescript-eslint supports TypeScript 7.

**[BUG] The container build fails while installing better-sqlite3**
Symptom: `npm ci` fails in the Docker build with a node-gyp error.
Cause: npm compiles better-sqlite3 from source, and the runtime image has no compiler.
Fix: The build stage uses Chainguard's `latest-dev` node image, which has `make` and `g++`, and installs `python3` with `apk`. Keep them there, not in the final stage.

**[BUG] The deploy scripts or the smoke test fail on Windows with `C:/Program Files/Git/...` in an error**
Symptom: `deploy/smoke-test.sh` or a `docker` command run from Git Bash fails with, for example, `ENOENT: no such file or directory, mkdir 'C:/Program Files/Git/data/backups'`.
Cause: Git Bash rewrites any argument that starts with `/` into a Windows path, including paths meant for inside a container.
Fix: Set `MSYS_NO_PATHCONV=1` for the command. CI runs on Linux and is not affected.

**[BUG] A new shell script fails in CI with exit code 126**
Symptom: CI reports exit code 126 when running a script in `deploy/`.
Cause: The file was committed without the executable flag, which is easy to miss on Windows.
Fix: Run `git update-index --chmod=+x deploy/<script>.sh` and commit.

**[BUG] Browser tests that go offline still see live updates**
Symptom: After `context.setOffline(true)`, a station still receives socket messages.
Cause: Playwright's offline mode may not close a WebSocket that is already open.
Fix: The app also watches the browser's `offline` and `online` events and failed requests. In tests, mute the socket with the `muteLive` option of `signIn` where a test needs it silent.

**[BUG] A test with a fast-forwarded clock passes even though the code is wrong**
Symptom: A clock-based browser test passes, but the race it targets is still there.
Cause: `clock.fastForward` runs each due timer once, often in an order that hides the race.
Fix: Delay the specific network response with `page.route`, and assert again after the late answer arrives, as the overnight test does.
