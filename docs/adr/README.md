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
| [0005](0005-self-host-on-lightsail.md) | Self-host on AWS Lightsail instead of Firebase | Accepted |
| [0006](0006-sqlite-with-nightly-backups.md) | Use SQLite with nightly backups | Accepted |
| [0007](0007-shared-role-logins.md) | Use shared role logins and named admin accounts | Accepted |
| [0008](0008-commit-to-main-until-in-use.md) | Commit directly to main until the app is in use | Accepted |
| [0009](0009-node-typescript-fastify.md) | Use Node.js, TypeScript and Fastify on the server | Accepted |
| [0010](0010-single-forward-card-status.md) | Move each card along a single status path | Accepted |
| [0011](0011-one-shift-per-date.md) | Allow one shift per date | Accepted |
| [0012](0012-shift-totals.md) | Define shift totals in one shared calculation | Accepted |
