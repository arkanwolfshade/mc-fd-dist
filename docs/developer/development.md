# Development
**Version 1.12.0** · mc-fd-dist · 2026-11-23 · For developers

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
- Chromium and WebKit for Playwright: `npx playwright install chromium webkit`.
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
- Two rulesets guard `main` (ADR 0017). One requires a pull request, signed commits, the code owner's review, clean CodeQL results and the three Codacy checks. The other requires the `check`, `container` and `secrets` jobs, and Chainguard's **Enforce - Commit Signing** check, which fails a pull request with a commit not signed by a key in `.chainguard/source.yaml` (ADR 0030). Repository administrators can bypass both. That is kept for repairing `main`, not for routine changes. Their definitions are in `.github/rulesets/` and are applied by hand, so keep the files in step with the settings page.
- The commit hook formats and lints staged files, runs the unit tests with coverage, and scans the staged changes for secrets. The push hook runs the type checks and unit tests.
- Unit test coverage has a floor of 96% for lines, statements and functions, and 91% for branches, set in `vitest.config.ts`. Below it, `npm run test:coverage` fails, so the commit hook refuses the commit and the required `check` job fails the pull request. Raise the floor as coverage grows; ask the maintainer before lowering it.
- Add an ADR in the same commit as any decision that is hard to reverse or crosses parts of the system.
- Dependencies in `package.json` are pinned to exact versions, and `.npmrc` sets `save-exact` so that `npm install <package>` records one. Dependabot raises the pins.
- npm runs a dependency's install script only if `allowScripts` in `package.json` approves it. `argon2` and `esbuild` are approved at their pinned versions. `better-sqlite3` is denied: it ships a prebuilt binary for every platform the app runs on, and its script would compile SQLite from source, which fails on a machine with no C++ compiler. When Dependabot raises an approved package, npm skips the new version's script and warns until it is reviewed with `npm install-scripts ls` and approved with `npm install-scripts approve <package>`. Both packages load prebuilt binaries, so a skipped script does not break the app.
- When a screen changes, run `npm run docs:screenshots` and check the guides still describe it.

**[SPEC]**
Screens work on phones and tablets as well as desktop, and the browser tests check it (ADR 0031). `playwright.config.ts` runs the files in `STATION_TESTS` on an iPhone, an iPhone turned sideways, an iPad, an Android phone and a 320 px window (which stands in for 200% text), and every file on desktop:

- A new test file for a screen people use at a station goes in `STATION_TESTS`. Do not set a window size inside a test; the project sets it.
- `e2e/layout.spec.ts` fails a change that makes the page scroll sideways or lets a control leave its panel. On touch profiles it also fails a button, link, field or choice smaller than 44×44 px, and a text field with text under 16 px (iOS Safari zooms the page on those). Keep new controls above both.
- The wall display's tests (`e2e/display.spec.ts`) are not in `STATION_TESTS`, because it is for a large landscape screen. They run on desktop and on the 1920×1080 `wall` project, and their server has a display account only because the file sets `withDisplay` (an account costs a password hash, so other tests do not get one).
- Run one profile with `npx playwright test --project=iphone`. Under a full local run with every worker the WebKit profiles can time out; `--workers=2` is closer to CI.
- WebKit reports no touch points even when emulating touch, so a test that needs to know about touch uses `matchMedia("(pointer: coarse)")`.

**[SPEC]**
Screens follow these rules for screen readers, and `e2e/accessibility.spec.ts` checks them. The shared pieces are in `client/src/Controls.tsx`:

- Show an error with `ErrorMessage`, which keeps its alert region on the page so that the error is read out when it appears. Status messages go in an element with class `live` and `aria-live` or `role="status"` that is always present.
- A button in a list says which item it acts on: the visible word, then the card or account in `ScreenReaderText`, as in "Call back card 3".
- A question that replaces a button moves focus to its safe answer, and answering puts focus back on the button, or on the section's heading if the row may go. Use `ConfirmButton`, or `afterRender` to focus something the change puts on the page.
- Each screen has one `main` area and a level-one heading, which a change of screen moves focus to.

**[SPEC]**
Colors come only from the custom properties at the top of `client/src/styles.css`. Each one has a dark value in two blocks that must match: one for a device set to dark, one for Dark chosen on the Help screen (`client/src/scheme.ts`). A new color needs a dark value in both, with text at 4.5:1 against its background, and `e2e/colors.spec.ts` checks the choice itself. Windows High Contrast replaces every color, so anything shown only by a fill needs a rule in the `forced-colors` block.

---

## 5. Continuous integration

**[SPEC]**
The CI jobs and what each runs:

| Job | Runs |
|---|---|
| `quality` | Formatting, lint, types, documentation check, license check, unit tests with coverage, coverage upload to Codacy, `npm audit`, PDF build |
| `e2e` | The browser tests, in three groups of device profiles that run at the same time |
| `check` | The job the ruleset requires. It waits for `quality` and every group of `e2e`, and fails unless all of them succeeded |
| `container` | shellcheck, hadolint, cfn-lint, Checkov, image build, Grype, smoke test, OWASP ZAP baseline |
| `secrets` | gitleaks over the whole history |
| `publish` | Pushes the image to `ghcr.io` after the other jobs pass on `main`, and attests where it was built |
| CodeQL | Separate workflow: security analysis of the TypeScript and the workflows |

**[SPEC]**
How the jobs fit together, and what keeps them honest:

- The jobs run at the same time, so a run takes as long as the slowest one. The browser tests were the slowest, which is why they are split. Each group installs the browsers and builds the client again, so more groups use more runner minutes.
- The groups are sets of device profiles, balanced by how long each profile takes, not by Playwright's own `--shard`. `--shard` splits by test count in order, which put all of the slow WebKit profiles into one shard. Measured on 2026-11-23, in seconds of test time: ipad 136, desktop 119, iphone-landscape 108, iphone 107, android 63, reflow 62, wall 10. Measure again (`npx playwright test --reporter=json`) if the groups drift, and move a profile between groups in `ci.yml`.
- The groups run in Playwright's own image, `mcr.microsoft.com/playwright`, pinned by digest. It holds every browser and the system packages they need, so the groups install nothing from Ubuntu's mirror. That install took 30 to 70 seconds in most runs, and 380 to 1,035 seconds in about a quarter of those checked on 2026-11-23. `quality` still installs Chromium for the PDFs.
- The image must be the same version as `@playwright/test` in `package.json`, or Playwright finds no browsers. When Dependabot bumps Playwright, change the image's tag and digest in the same pull request; `tools/ci-gate.test.ts` fails until they match. `docker buildx imagetools inspect mcr.microsoft.com/playwright:v<version>-resolute` prints the digest.
- A new profile in `playwright.config.ts` must be added to exactly one group in `ci.yml`. `tools/ci-gate.test.ts` fails until it is, so that no profile goes untested.
- The ruleset requires `check`, `container` and `secrets` by name (ADR 0017). `check` runs even when a job it waits for failed, because GitHub counts a required check that is skipped as passing.
- A job added to `ci.yml` that the ruleset does not require must be added to `check`'s `needs`, or a failure in it would not stop a merge. `tools/ci-gate.test.ts` fails until it is, and also fails if `check` stops running after a failure.
- A failed group uploads its traces as `playwright-traces-<group number>`. Open the failed group's log first: the other groups still ran, so one run shows every failure.

**[SPEC]**
The `quality` job uploads coverage to Codacy:

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

**[SPEC]**
Dependabot moves the two `cgr.dev` digests in the Dockerfile together, in one pull request (first seen in #28). Before merging one, check that both images are still on the same Node major, because `better-sqlite3` is compiled in one and loaded in the other.

**[SPEC]**
Codacy analyses every pull request and reads `.codacy.yaml` from the default branch. Each exclusion there says why. Its Lizard tool flags a function over 55 lines of code or with a complexity over 10, so keep functions small.

**[SPEC]**
The Deploy workflow (`.github/workflows/deploy.yml`) is started by the Release workflow after it publishes, or by hand with a version. It is not part of CI. Section 4 of `docs/developer/operations.md` describes using it. It does this:

- It runs in the GitHub `production` environment, so a reviewer must approve it before the job starts.
- It then waits for a window outside shift hours, and fails at once if the window is more than 340 minutes away (ADR 0022).
- Before the wait, it checks the release with `gh release verify` and the image's build attestation, and takes the image's digest from the release's `image.txt`. It then checks out the release's own commit, so the release's scripts and templates do the deploy, applies the stack, and releases the image on the server.

**[SPEC]**
The Release workflow (`.github/workflows/release.yml`) is run by hand from `main` (ADR 0029):

- It takes a version such as `0.2.0`, and refuses one that is not higher than every existing `v` tag. The rules are in `tools/release-version.ts`.
- It takes the latest commit on `main`, or a full commit hash you give, and requires that CI passed for it and that its image carries this repository's build attestation.
- **Dry run** is ticked by default. It runs every check, builds the SBOM and shows the release notes in the job summary, and publishes nothing.
- Unticked, it creates a draft release with `image.txt` (the image's name by digest) and `sbom.spdx.json`, adds the version tag to the image, publishes the release and verifies it with `gh release verify`, retrying for two minutes because GitHub writes the release's attestation a moment after publishing. Publishing makes the tag and files permanent. It then starts Deploy for the version, which waits for approval.
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
Cause: npm ran better-sqlite3's compile, which needs Python, `make` and a C++ compiler. The package ships prebuilt binaries for every platform the app runs on, so the compile is not needed.
Fix: Keep `"better-sqlite3": false` in `allowScripts` in `package.json`, so npm uses the prebuilt binary. If a new version stops shipping one for `linux-x64`, approve the script and add `python3` back to the build stage with `apk`; `latest-dev` already has `make` and `g++`.

**[BUG] The deploy scripts or the smoke test fail on Windows with `C:/Program Files/Git/...` in an error**
Symptom: `deploy/smoke-test.sh` or a `docker` command run from Git Bash fails with, for example, `ENOENT: no such file or directory, mkdir 'C:/Program Files/Git/data/backups'`.
Cause: Git Bash rewrites any argument that starts with `/` into a Windows path, including paths meant for inside a container.
Fix: Set `MSYS_NO_PATHCONV=1` for the command. CI runs on Linux and is not affected.

**[BUG] The git hooks do not run**
Symptom: A commit is not formatted or linted, or a push with a failing test goes through, and CI finds the problem instead.
Cause: `git config core.hooksPath` prints nothing, so git runs no hooks. Husky installs them when `npm install` runs the `prepare` script, which did not happen in this checkout.
Fix: Run `npx husky`, then check that `git config core.hooksPath` prints `.husky/_`.

**[BUG] `npm ci` fails on Windows while building better-sqlite3**
Symptom: `npm ci` ends with `gyp ERR! find VS` and `node-gyp rebuild` failing for `better-sqlite3`, and leaves `node_modules` empty.
Cause: npm runs `node-gyp rebuild` for the package because it has a `binding.gyp`, and that needs Visual Studio's C++ tools. The package already contains prebuilt binaries for Windows, macOS and Linux, so the build is not needed.
Fix: Run `npm ci --ignore-scripts`, which installs everything and uses the prebuilt binary. CI and the container build compile it on Linux, where the compiler is present.

**[BUG] A new shell script fails in CI with exit code 126**
Symptom: CI reports exit code 126 when running a script in `deploy/`.
Cause: The file was committed without the executable flag, which is easy to miss on Windows.
Fix: Run `git update-index --chmod=+x deploy/<script>.sh` and commit.

**[BUG] Browser tests that go offline still see live updates**
Symptom: After `context.setOffline(true)`, a station still receives socket messages.
Cause: Playwright's offline mode may not close a WebSocket that is already open. In WebKit it never does, so the two tests that wait for the Offline banner skip WebKit (`WEBKIT_KEEPS_SOCKET` in `e2e/fixtures.ts`).
Fix: The app also watches the browser's `offline` and `online` events and failed requests. In tests, mute the socket with the `muteLive` option of `signIn` where a test needs it silent.

**[BUG] A test that holds back a request hangs on WebKit**
Symptom: A test that delays a response with `page.route` times out on the iPhone and iPad profiles, waiting for a request it never sees, and passes on Chromium.
Cause: The app installs a service worker in a production build. WebKit sends every request from a page that a worker controls around Playwright's `page.route`, even when the worker lets it through. Chromium does not.
Fix: Run the test without the worker, with `test.use({ serviceWorkers: "block" })` inside a `test.describe`, as the "reload answered late" test in `e2e/shift-flow.spec.ts` does. Check that the test still fails against the code it guards, because a test that cannot see the request proves nothing.

**[BUG] A test with a fast-forwarded clock passes even though the code is wrong**
Symptom: A clock-based browser test passes, but the race it targets is still there.
Cause: `clock.fastForward` runs each due timer once, often in an order that hides the race.
Fix: Delay the specific network response with `page.route`, and assert again after the late answer arrives, as the overnight test does.
