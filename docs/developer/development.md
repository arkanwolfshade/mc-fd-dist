# Development
**Version 1.0.0** · mc-fd-dist · 2026-11-08 · For developers

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
- Docker is not needed locally. CI builds and tests the container.

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
| `npm run test:coverage` | Unit tests with coverage thresholds |
| `npm run test:e2e` | Builds the client, then runs the browser tests (Playwright) |
| `npm run typecheck` | Type checks the server, client and tests |
| `npm run lint` | Oxlint, with type-aware rules |
| `npm run format` / `format:check` | Prettier |
| `npm run build` | Builds the server and client into `dist/` |
| `npm run demo` | Runs the side-by-side walkthrough. `DEMO_STEP_SECONDS` sets the pace |
| `npm run docs:screenshots` | Retakes the guide screenshots |
| `npm run docs:pdf` | Builds printable guides into `dist/guides/` |
| `npm run docs:check` | Checks HADS format, links and pictures |

---

## 4. Workflow

**[SPEC]**
- Write a failing test first and watch it fail, then make it pass (CONTRIBUTING.md).
- Commit straight to `main` for now (ADR 0008), with Conventional Commit messages.
- The commit hook formats and lints staged files and scans them for secrets. The push hook runs the type checks and unit tests.
- Add an ADR in the same commit as any decision that is hard to reverse or crosses parts of the system.
- When a screen changes, run `npm run docs:screenshots` and check the guides still describe it.

---

## 5. Continuous integration

**[SPEC]**
The CI jobs and what each runs:

| Job | Runs |
|---|---|
| `check` | Formatting, lint, types, documentation check, unit tests with coverage, coverage upload to Codacy, `npm audit`, browser tests, PDF build |
| `container` | shellcheck, hadolint, cfn-lint, Checkov, image build, Grype, smoke test, OWASP ZAP baseline |
| `secrets` | gitleaks over the whole history |
| `publish` | Pushes the image to `ghcr.io` after the other jobs pass on `main` |
| CodeQL | Separate workflow: security analysis of the TypeScript and the workflows |

**[SPEC]**
- The coverage upload reads the repository's Codacy token from the `CODACY` Actions secret. Where the secret cannot be read, as in Dependabot's runs, the step is skipped with a notice.
- A failed upload is a warning, not a failure, so that an outage at Codacy cannot hold up a release.
- The upload does not use Codacy's own action, which runs a script from Codacy's `master` branch. It fetches the reporter script from a pinned commit and pins the reporter version. When updating either, change both together in `ci.yml`.

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
Cause: npm compiles better-sqlite3 from source, and the slim base image has no compiler.
Fix: The build stage installs `python3`, `make` and `g++`. Keep them there, not in the final stage.

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
