# Architecture decision records

Each record captures one significant decision, why it was made, and what it costs.

- Add a new numbered file using [template.md](template.md).
- Records are not rewritten once accepted. To change a decision, add a new record and mark the old one as superseded.
- Record a decision when it is hard to reverse, affects more than one part of the system, or rejects an obvious alternative.

| # | Decision | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-anonymous-same-day-tickets.md) | Treat Card # as an anonymous same-day ticket | Accepted |
| [0003](0003-enter-once-workflow.md) | Enter card details once and share them live | Accepted |
| [0004](0004-installable-web-app.md) | Build one installable web app for all platforms | Accepted |
| [0005](0005-self-host-on-lightsail.md) | Self-host on AWS Lightsail instead of Firebase | Accepted; account arrangement superseded by 0015 |
| [0006](0006-sqlite-with-nightly-backups.md) | Use SQLite with nightly backups | Accepted |
| [0007](0007-shared-role-logins.md) | Use shared role logins and named admin accounts | Accepted |
| [0008](0008-commit-to-main-until-in-use.md) | Commit directly to main until the app is in use | Accepted |
| [0009](0009-node-typescript-fastify.md) | Use Node.js, TypeScript and Fastify on the server | Accepted |
| [0010](0010-single-forward-card-status.md) | Move each card along a single status path | Accepted; amended by 0019 |
| [0011](0011-one-shift-per-date.md) | Allow one shift per date | Accepted |
| [0012](0012-shift-totals.md) | Define shift totals in one shared calculation | Accepted; amended by 0019 and 0023 |
| [0013](0013-closing-shifts.md) | Close shifts by hand and automatically overnight | Accepted |
| [0014](0014-keep-working-through-dropouts.md) | Queue writes on the device during connection dropouts | Accepted |
| [0015](0015-deployment-and-backups.md) | Deploy with Docker Compose on Lightsail from a CloudFormation stack | Accepted; amended by 0022 |
| [0016](0016-code-health-checks.md) | Enforce code health checks in CI | Accepted |
| [0017](0017-branch-rulesets.md) | Protect main with branch rulesets | Accepted; amended by 0025 |
| [0018](0018-documentation.md) | Write the guides and developer docs once, in HADS Markdown | Accepted |
| [0019](0019-correcting-unserved-cards.md) | Correct unserved cards by recording them as left, or by deleting them | Accepted; amended by 0020 |
| [0020](0020-food-bank-process-rules.md) | Follow the food bank's own process and words | Accepted; amended by 0023 |
| [0021](0021-visual-design.md) | Give the screens a quiet design with the card number as a ticket | Accepted |
| [0022](0022-github-deployments.md) | Release from GitHub Actions after approval, through narrow AWS roles | Accepted |
| [0023](0023-partner-families-carts-and-extras.md) | Enter partner Families as cards, and match carts and extras to the Family | Accepted |
| [0024](0024-intake-initials.md) | Record the intake volunteer's initials on each walk-in card | Accepted |
| [0025](0025-require-signed-commits.md) | Require signed commits on main | Accepted |
| [0026](0026-license-the-project-under-mit.md) | License the project under MIT | Accepted |
| [0027](0027-build-on-chainguard-node-images.md) | Build the app image on Chainguard's node images | Accepted |
