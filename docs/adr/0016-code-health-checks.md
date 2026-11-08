# 0016. Enforce code health checks in CI

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

The project had type checking, unit and browser tests, a container smoke test, shellcheck and cfn-lint. It had no linting, no formatting standard, and no security scanning of the code, its dependencies, the container image or the running app. The app will hold a food bank's records and run on the public internet, maintained mostly by one person.

## Decision

Every push and pull request runs these checks, and any failure blocks the build and the image publication:

| Area | Tool |
|---|---|
| Formatting | Prettier, 100-character lines, Markdown excluded |
| Linting | Oxlint with oxlint-tsgolint for type-aware rules; correctness, suspicious and performance rules are errors |
| Types | `tsc` for the server, client and tests |
| Tests | Vitest with coverage thresholds set just below the first measurement, plus Playwright |
| SAST | GitHub CodeQL with the extended security queries, for TypeScript and for the workflows themselves |
| Dependencies | `npm audit` at high severity, and Dependabot update pull requests for npm, Docker and Actions |
| Container image | Grype, failing on fixable high or critical vulnerabilities |
| Dockerfile and template | hadolint, Checkov, cfn-lint |
| Scripts | shellcheck |
| Secrets | gitleaks over the whole history |
| DAST | OWASP ZAP baseline scan against the deployed stack running in CI |

Third-party actions and scanner images are pinned to a full commit or image digest, never to a tag.

Each rule turned off, and each finding skipped, is recorded where it applies with the reason: in `.oxlintrc.json` (explained in the commit that added it), `.hadolint.yaml`, the template's Checkov metadata, and `deploy/zap/rules.tsv`.

## Alternatives considered

- **ESLint with typescript-eslint:** The usual choice, but typescript-eslint supports TypeScript only below 6.1, and this project uses TypeScript 7.
- **Biome:** One tool for linting and formatting, but its type-aware rules are limited, and it would have meant a second reformatting.
- **Trivy:** One tool for the image, the Dockerfile and the template. In March 2026 attackers rewrote nearly all of `trivy-action`'s version tags to run a credential stealer, so Grype and Checkov were chosen instead.
- **Semgrep alongside CodeQL:** Overlapping coverage and more noise for one maintainer. It can be added if CodeQL proves too narrow.
- **An authenticated DAST scan:** Would reach the screens behind sign-in. The baseline scan comes first; an authenticated scan can follow.

## Consequences

- Problems are caught before code reaches the server, at the cost of a slower CI and more tools to keep current.
- Dependabot opens pull requests, while other work is committed straight to main (ADR 0008). They are reviewed and merged by hand.
- Oxlint's type-aware linting is younger than typescript-eslint, so it may miss problems typescript-eslint would catch. Revisit once typescript-eslint supports TypeScript 7.
- Coverage thresholds stop coverage from falling, but do not show that the tests are meaningful.
