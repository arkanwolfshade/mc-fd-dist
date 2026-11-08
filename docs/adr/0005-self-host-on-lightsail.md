# 0005. Self-host on AWS Lightsail instead of Firebase

- **Status:** Accepted; the two-account arrangement is superseded by [0015](0015-deployment-and-backups.md)
- **Date:** 2026-11-06

## Context

Minimal cost is a requirement, with free preferred but some hosting cost acceptable for a better solution. The data is anonymous (see 0002), and the shifts are small: about 200 cards.

## Decision

Run the app on a small AWS Lightsail server. Production runs in a new AWS account owned by the food bank, on a shared staff mailbox with MFA on the root user, and with the developer as an administrator. The prototype runs in the developer's own AWS account.

The food bank's existing Amazon retail login is not reused, because AWS does not allow a root email already used on Amazon.com.

## Alternatives considered

- **Firebase on the free Spark plan (recommended during planning):** No hosting cost and built-in real-time sync, but NoSQL reporting and vendor lock-in. The developer chose self-hosting for SQL and control.
- **Supabase:** Real Postgres, but the free plan pauses after a week of inactivity, and Pro costs about $25 per month.
- **Google Sheets with no-code tools:** Familiar to staff, but slower live updates and clumsier entry on tablets.
- **A machine on site:** No monthly fee, but hardware failure, power and physical security all become local concerns.

## Consequences

Full control, SQL reporting and no vendor limits, for about $5 per month before backups and a domain (third-party figure, to confirm on AWS pricing pages). AWS nonprofit credits through TechSoup may offset this if the food bank is eligible.

Patching, uptime and backups all fall to the developer, which raises the dependence on one technical person. The runbook, staff-held accounts and paper fallback reduce this risk but do not remove it. If no successor is available, the food bank will need a migration or retirement path.
