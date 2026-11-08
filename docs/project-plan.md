# Food bank shift tracker: replacing the MC-FD and MC-Dist sheets

## Context

The food bank tracks each shift on two printed sheets: MC-FD (front desk) and MC-Dist (distribution). Both repeat the same family details, totals are added up by hand per page, and neither station can see the other's work. This project replaces the sheets with a small web app that shares one live record between the stations, stores it permanently, and produces reports.

Requirements: Windows, macOS, iOS and Android support; minimal cost; real-time transfer from front desk to distribution; a persistent data store; reports; access controls on anything hosted.

## Decisions

| Area | Decision |
|---|---|
| Identity | Card # is an anonymous same-day ticket. No names or household records are stored. |
| Ownership | The developer builds and maintains it. A named staff member holds the accounts and billing and runs the paper fallback. |
| Connectivity | Solid Wi-Fi at both stations. Brief dropouts are tolerated. |
| Workflow | Front desk enters a card once. Distribution sees it live, confirms or corrects it, adds weights, marks it distributed. |
| Client | Installable web app (PWA), one codebase for all four platforms. |
| Hosting | Small AWS Lightsail server in a new AWS account owned by the food bank. The prototype runs in the developer's AWS account. |
| Data store | SQLite on the server, verified nightly copy to S3, plus daily Lightsail snapshots. |
| Access | Shared role logins for front desk and distribution; individual admin accounts for staff. |
| Devices | Dedicated food bank devices stay signed in at each station. Personal devices are backup only and sign out afterward. |
| Reports | Live shift summary, date-range totals, CSV export. |
| Rollout | Dry run, then two live shifts with paper as the official record, then cutover. |

## Recommended technical approach

These choices were not discussed in the interview and are open to change.

- **Server:** Node.js with TypeScript, Fastify, and better-sqlite3 in WAL mode.
- **Live updates:** WebSocket broadcast per shift, with a full resync on reconnect.
- **Client:** Vite with Preact, plus a service worker for install and a local queue for writes during dropouts. Each queued write carries a client-generated ID so that retries are safe (see ADR 0014).
- **Deployment:** Docker Compose with Caddy for automatic HTTPS. A domain name is needed, because PWA install requires HTTPS.
- **Repo:** New repository, with deployment and restore scripts checked in so that moving from the prototype account to the food bank account is a repeatable step.

## Data model

- **shift:** date (one shift per date), status (open or closed), reopened flag.
- **card:** shift, card number (unique per shift), family size, arrival method (one of East, West, AC, Bus, Walk), senior box (yes/no), cheese (yes/no), TEFAP bags, TEFAP override flag, other (text), status (entered, called, confirmed, distributed), up to three load weights, revision.
- **partner_batch:** shift, partner (Door Dash or Helping Hands), family count, weight. Zero or more per shift, entered in a dedicated end-of-shift step, never mixed into the card list.
- **returned_batch:** shift, weight, time. A running log that is not tied to any card.
- **account:** role login or named admin, with password hash.
- **audit_log:** who (station or admin), what, when. Needed because shared logins cannot identify a person.

## Business rules

- TEFAP bags are calculated from family size: 1-4 = 1, 5-8 = 2, 9+ = 3. Staff can override.
- Card weight is the sum of its load weights.
- Shift net weight is card loads, plus partner batch weights, minus returned batches (see ADR 0012).
- The "on this page" footer totals go away. Their purpose moves to the live shift summary.
- Two stations can edit one card, so each write carries a revision number. A stale write prompts a review instead of silently overwriting.

## Screens

1. **Front desk:** fast card entry and a live list of the shift's cards.
2. **Distribution:** live queue, confirm or correct, enter weights, mark distributed; returned-batch log; end-of-shift partner batch step.
3. **Shift summary:** matches the MC-Dist Totals table and updates live.
4. **Admin:** close and reopen shifts, date-range totals, CSV export, change role passwords, manage admin accounts, recent activity. Distribution can also close a shift, and old shifts close automatically overnight (see ADR 0013).

## Security and operations

- **AWS account:** Separate from the Amazon retail wishlist account, because AWS root email cannot be one already used on Amazon.com. Use a shared staff mailbox for root, enable MFA, and keep routine access in IAM rather than root.
- **Application:** HTTPS only, hashed passwords (Argon2), login rate limiting, role checks on the server.
- **Server:** Automatic OS security updates, firewall limited to web traffic and restricted SSH, uptime alert to the developer and the staff owner, AWS budget alert.
- **Backups:** Nightly SQLite backup to S3, with an integrity check, plus daily snapshots. A restore drill before go-live and on a regular schedule.
- **Outage procedure:** Switch to paper, enter the paper records afterward, documented in the runbook.
- **Runbook:** One page for the staff owner covering where the accounts are, how to reach the developer, and how to run a shift on paper.

## Cost

Estimates from third-party guides, to confirm on official AWS pricing pages:

- Lightsail with public IPv4: about $5 per month.
- Snapshots: about $0.05 per GB-month.
- S3 backup: expected to be negligible at this data size (not priced).
- Domain: annual fee (not priced).
- Possible offset: TechSoup lists $1,000 per year in AWS credits for eligible nonprofits, with an admin fee. The food bank's eligibility is unconfirmed.

## Build order

1. Scaffold the repo, schema, and role and admin login.
2. Front desk and distribution screens with live sync.
3. Partner batches, returned batches, TEFAP rule, shift summary.
4. Admin, date-range reports, CSV export, audit log.
5. PWA install, dropout queue and resync.
6. Deployment, backups, monitoring, and restore scripts, in the AWS account that is handed to the food bank (see ADR 0015).
7. Code health tools, run in CI and blocking a merge when they fail. Proposed, to be confirmed:
   - linting and formatting checks;
   - type checking, which is already in place;
   - static security analysis (SAST);
   - scanning of dependencies, the container image and the infrastructure template, plus secret scanning;
   - dynamic security testing (DAST) against the running app.
8. Developer and user documentation following [HADS](https://github.com/catcam/hads), the Human-AI Document Standard. It replaces the earlier plan for a short runbook and volunteer guide, and covers:
   - developer documentation: architecture, setup, operations and the runbook;
   - a user guide for each station, with screenshots for food bank volunteers. The screenshots are generated from the end-to-end tests, so that they stay current as the screens change.
9. Hand the AWS account to the food bank and run the rollout.

## Verification

- **Automated tests:** TEFAP rule and override, card and shift totals, CSV output, role permissions, stale-write handling, retry of queued writes without duplicates.
- **Device test:** A card entered at the front desk appears at distribution within about a second on Windows, macOS, iOS and Android, as an installed app.
- **Dropout test:** Disconnect a station mid-entry, reconnect, and confirm that no entries are lost or duplicated.
- **Load test:** Simulate a 200-card shift with several stations on the chosen Lightsail plan.
- **Restore drill:** Rebuild a new server from the S3 backup and confirm that the data and totals match.
- **Dry run:** Volunteers work through a simulated shift on the prototype.
- **Parallel shifts:** Two live shifts where the app's totals match the paper totals, with any differences explained, before paper stops being the official record.

## Open questions

Confirm with staff before the affected build step:

1. ~~What "Total # of families" counts.~~ Answered: see ADR 0012. A card entered but never distributed counts as a family, but at the end of a shift it is an error to be corrected.
2. ~~How Callback works in practice.~~ Answered: see ADR 0010.
3. ~~Whether "Other" is free text or a set of known items.~~ Answered 2026-11-08: free text.
4. ~~Whether a day can have more than one shift.~~ Answered: see ADR 0011. ~~Whether card numbers ever exceed 200.~~ Answered 2026-11-08: the 200 limit applied only to paper; the app has none.
5. How long data must be kept, and whether anything outside the food bank requires these figures (for example TEFAP reporting). Still open. Backups are kept 365 days meanwhile.
6. ~~Who the named staff owner is.~~ Answered 2026-11-08: named by the food bank, and recorded outside this public repository. Still to confirm: that they accept the role.
7. What devices the food bank has or needs to obtain. Still open.
8. Whether food bank staff approve the monthly cost and the double entry during parallel shifts. Still open.
9. ~~Which time zone closes shifts overnight.~~ Answered 2026-11-08: Phoenix (`America/Phoenix`).

## Risks

- **Developer dependency:** A self-hosted server leaves patching, uptime and code fixes with one technical person. The runbook and paper fallback reduce this but do not remove it. If no successor appears, plan a migration or retirement path.
- **Data loss window:** A disk failure could lose entries since the last backup. The shift's paper fallback does not help if paper was not in use at the time, so a failure during live use could lose part of that shift.
- **Shared logins:** Entries are attributed to a station, not a person, and a leaked password must be changed for everyone.
- **iOS PWA behavior:** Install and background behavior on iPhones and iPads should be tested early on real devices.
- **Tight rollout assumption:** Wi-Fi reliability at both stations is the user's report and is untested; check it during the dry run.

## Sources for pricing and account facts

- Lightsail pricing: https://onedollarvps.com/pricing/aws-lightsail-pricing and https://cloudburn.io/blog/amazon-lightsail-pricing
- AWS root email rules: https://repost.aws/knowledge-center/change-email-address
- AWS root user guidance: https://docs.aws.amazon.com/wellarchitected/latest/framework/sec_securely_operate_aws_account.html
- TechSoup AWS credits: https://page.techsoup.org/aws-credit-grant-program
