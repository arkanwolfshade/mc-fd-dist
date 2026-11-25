# 0037. Choose the deploy target with an input, and check a release before approval

- **Status:** Accepted
- **Date:** 2026-11-24

## Context

The app runs on one Lightsail server in AWS (ADRs 0005 and 0015). After positive feedback from the food bank's director, the maintainer wants to try running it on Google Cloud as well, on their personal Google account, to compare cost and effort. Google's free tier covers one small VM, so the trial should cost about $4 a month, mostly for a static IP address. AWS must stay the production target and keep deploying exactly as before.

The Deploy workflow (ADRs 0022 and 0029) was one job in the `production` environment: a reviewer approved it, then it checked the release, waited for a window outside shift hours, applied the AWS stack and released on the server. A second target needs its own credentials, its own approval and its own queue, without any way to send a release to the wrong place.

## Decision

- **A `target` input:** Deploy takes a `target`, chosen from a fixed list and defaulting to `aws`. The Release workflow starts Deploy without one, so an automatic deploy always goes to AWS.
- **One job per target:** a `verify` job checks the release (signature, image digest and build attestation) and passes on its tag, digest and commit. Each target has its own job, which runs only when chosen, deploys only the commit `verify` checked, and has its own GitHub environment and concurrency group. A deploy waiting for approval on one target can't replace one waiting on another. `tools/deploy-workflow.test.ts` keeps these rules.
- **Checked before approval:** `verify` runs before anyone is asked to approve, and needs no cloud credentials. A reviewer is only asked about a release that has already passed its checks. Before this, the checks ran after approval.
- **The shift-hours guard stays on the AWS job.** It protects the shifts that run against production.
- **Shared server scripts:** both targets install the same files the same way, through `deploy/push-release.sh`. Each target's `release-on-server.sh` only opens the way in.
- **Backups can stay on the server:** `BACKUP_UPLOAD=off` in a server's `.env` keeps each backup on the server and skips the upload. It is for a server with test data only. Unset means on, and any other value is refused before a backup is written, so a production server with a missing bucket still fails as before.
- **Setup works on other images:** `server-setup.sh` adds the `ubuntu` user to the `docker` group only if the image has that user.
- **The Google target follows in a separate change.** As decided:
  - **Scope:** a trial with test data only, built so that parity can be added later.
  - **Infrastructure:** Terraform applied through Google's Infrastructure Manager. Its bootstrap (the GitHub identity link and the deploy service account) is applied by the maintainer; its stack (VM, static IP, firewall) is applied by Deploy through a narrower service account that cannot grant IAM.
  - **Approval:** a `gcp-trial` environment.
  - **Server access:** SSH only through Google's Identity-Aware Proxy with OS Login.
  - **Backups:** `BACKUP_UPLOAD=off`.
  - **Shift guard:** none.
  - **Spend:** a budget alert set by hand.

*Amended 2026-11-24:* the Google target is built as follows.

- **Where:** the existing MC-FD-DIST project on the maintainer's own Google account, in us-west1 (Oregon), which is in both Google's free tier and Infrastructure Manager's regions. The project's ID is kept only in the `gcp-trial` environment's variables.
- **Terraform 1.5.7**, the newest version Infrastructure Manager's free tier runs, with the Google provider pinned to 8.12 or later 8.x. CI runs `terraform fmt`, `terraform validate` and checkov on `deploy/gcp`.
- **Three service accounts from the bootstrap:**
  - `github-deploy`, which only the `gcp-trial` environment of this repository may use, identified by GitHub's fixed numbers for the repository and its owner. It holds Infrastructure Manager's editor role (no access to IAM policies) and compute viewer across the project. OS Login admin (sudo, as AWS's one-time key gives) is limited by an IAM condition to the trial server, and IAP tunnel access to port 22, because the project may hold other machines.
  - `im-stack`, which runs the stack and can manage only the server, its network, its address and its firewall.
  - `mc-fd-dist-vm`, the server's own account, with no roles.
  
  `im-bootstrap`, which applies the bootstrap, is made by `deploy/gcp/prepare-project.sh` and is never available to the pipeline.
- **A network of its own:** the stack creates its own network, because a project's `default` network normally carries a rule that opens SSH to the whole internet. Ports 80 and 443 are open to all; 22 only to the proxy's range (35.235.240.0/20).
- **One e2-micro server** with a 30 GB standard disk, Ubuntu 24.04, Shielded VM and OS Login, and a static address named through sslip.io, as on AWS.
- **The startup script runs setup only once.** Google runs it at every boot, so it does nothing when `/opt/mc-fd-dist/setup-commit` exists. Otherwise the nightly update restart would put the setup commit's files back over the last release's.
- **Trusted host keys:** the server publishes its SSH host keys in its guest attributes, and Deploy trusts only those.
- **`release.sh` refuses the example site address** from `.env.example`, which would otherwise ask Let's Encrypt for a certificate the server can't get. This guards a new server on either target.
- **The first server is made by hand** with `deploy/gcp/update-stack.sh`, so that `.env` can be filled in before the first release (operations runbook, section 9).

## Alternatives considered

- **A second workflow for Google:** no change to the production workflow, but the release checks would be copied, and the two copies could drift apart.
- **One job with steps for each target:** fewer jobs, but every step would need its own condition, and the approval and queue would be shared between targets.
- **Checking the release after approval, as before:** keeps the old order, but asks a reviewer to approve a release that might still fail its checks.
- **Reusing the `production` environment for every target:** one approval rule, but a trial deploy could replace a waiting production deploy, and both targets' settings would sit together.

## Consequences

- AWS deploys run the same steps as before, now split across two jobs. The `production` environment and the `deploy-production` queue are unchanged.
- The workflow and the release's scripts move apart. Deploy always checks out the release's own commit, so `push-release.sh` and the backup opt-out reach a server only in a release cut after this change. A Google deploy needs such a release too.
- Making Google production would need:
  - backups to Cloud Storage through the VM's own service account (no stored key);
  - a check that refuses replacing or deleting resources, as `tools/check-change-set.ts` does for AWS;
  - the shift-hours guard;
  - disk snapshots;
  - a custom role for `im-stack` with only the permissions the stack uses, in place of the predefined compute roles, which can also set IAM and project-wide metadata on instances (found by an automated security review; the list can only be tested by applying it);
  - moving off a personal account.
