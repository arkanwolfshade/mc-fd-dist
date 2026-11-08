# 0015. Deploy with Docker Compose on Lightsail from a CloudFormation stack

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

ADR 0005 chose a small Lightsail server, with a prototype in the developer's own AWS account and production later in a new account owned by the food bank. ADR 0006 chose SQLite with nightly backups to S3 and daily snapshots. Both left the details of deployment open.

The developer's existing account turned out to be a member of an AWS Organization run from an account the developer does not control, so it was not a suitable home for either.

## Decision

**Account.** A new standalone AWS account was created for this app alone. It is both the prototype and the production account, and it will be handed to the food bank by changing the root email, MFA device and payment card. This replaces the two-account arrangement in ADR 0005. Routine work uses an IAM user with MFA, not the root user.

**Infrastructure.** One CloudFormation stack (`deploy/aws/stack.yaml`) in us-west-2, the nearest region to Phoenix, creates:

- a Lightsail server on the `nano_3_0` plan (0.5 GB, $5 a month) running Ubuntu 24.04;
- a static IP, daily automatic snapshots, and ports for HTTP and HTTPS, with SSH open only to the Lightsail console's browser client;
- a private, versioned, encrypted S3 bucket for backups, kept if the stack is deleted;
- an IAM user that can only add and read backups, because Lightsail servers cannot take an IAM role;
- a monthly budget warning.

**Server.** The launch script runs `deploy/server-setup.sh` from a pinned commit. It installs Docker, adds 1 GB of swap, turns on automatic security updates with restarts at 03:30, and installs a nightly backup timer.

**App.** CI builds the container image, runs the whole stack against it, and publishes it to the GitHub container registry as a public package once every check on main passes. The server runs it with Docker Compose behind Caddy, which obtains the HTTPS certificate. The container runs as a non-root user with a read-only root filesystem.

**Backups.** At 02:00 each night, `deploy/backup.sh` writes a backup with SQLite's backup method, checks it, and uploads it to S3. Backups are kept for 365 days. Older versions of an overwritten backup are kept just as long, so a stolen key cannot quietly replace the history. Copies on the server are kept for 7 days for quick restores. Lightsail snapshots at 04:00 cover the whole server. `deploy/restore.sh` restores a backup by name and keeps the replaced database.

## Alternatives considered

- **Console set-up by hand:** Nothing to install, but it can't be repeated exactly or reviewed in the repository.
- **Terraform:** Works across providers, but adds a tool and a state file to look after. CloudFormation is built into AWS and needs neither.
- **A private image on Amazon ECR:** Keeps the image in the account, but needs a second key on the server. The image holds only code that is already public.
- **Building the image on the server:** Needs no registry, but is slow and memory-hungry on 0.5 GB, and every update would compile on the live server.
- **A Lightsail bucket attached to the server:** Needs no key, but grants full access, including deleting backups.
- **S3 Object Lock:** Makes backups impossible to delete early, but fixes a retention period that even an administrator can't shorten in compliance mode. Deferred until the food bank says how long data must be kept.
- **The 1 GB plan at $7 a month:** More headroom. In CI the app used about 45 MB and Caddy about 11 MB, so the smaller plan with swap was chosen. Docker and Ubuntu were not measured.

## Consequences

- Running costs are about $5–6 a month, before any free-tier credits.
- The server holds a long-lived backup key. It can add and read backups but not delete them or their history.
- Updates depend on GitHub, both for the image and for the setup script.
- Changing the plan means rebuilding the server from a snapshot, because a Lightsail plan can't be changed in place.
- **Not yet decided:** the hostname, which is needed before Caddy can obtain a certificate, and alerts for downtime and missing backups. Until alerts exist, only the budget warning reports anything, and the server runs unwatched.
- **Assumed, to confirm with staff:** that 365 days is long enough to keep backups.
