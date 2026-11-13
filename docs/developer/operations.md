# Operations runbook
**Version 1.2.0** · mc-fd-dist · 2026-11-13 · For the maintainer and the staff owner

---

## AI READING INSTRUCTION

Read `[SPEC]` and `[BUG]` blocks for the procedures and the facts they depend on.
Read `[NOTE]` only if the reasoning behind a procedure is needed.
`[?]` blocks describe parts that are not yet in place or not yet tested. Check them before relying on them.

---

## 1. Where things are

**[SPEC]**
Where each part of the system lives:

| Thing | Where |
|---|---|
| Code and issues | GitHub, `arkanwolfshade/mc-fd-dist` |
| Container image | `ghcr.io/arkanwolfshade/mc-fd-dist`, tagged with each commit and `latest`, built on Chainguard's node images (ADR 0027) |
| AWS account | A standalone account for this app alone, to be handed to the food bank (ADR 0015) |
| Region | `us-west-2` (Oregon) |
| Infrastructure | CloudFormation stack `mc-fd-dist`, from `deploy/aws/stack.yaml` |
| Server | Lightsail instance `mc-fd-dist`, Ubuntu 24.04, app files in `/opt/mc-fd-dist` |
| Backups | The stack's S3 bucket, under `nightly/` |
| Release access | CloudFormation stack `mc-fd-dist-github-deploy`, from `deploy/aws/github-deploy.yaml` (ADR 0022) |

**[SPEC]**
Where settings and credentials live. None of them is in the repository.

| Setting | Where |
|---|---|
| The admin's AWS sign-in | `~/.aws/config` on the admin's computer, profile `mc-fd-dist`, signed in with `aws login` |
| Stack settings, such as the budget email | The parameters of the `mc-fd-dist` stack, in the CloudFormation console |
| Bucket, backup user and IP address names | The outputs of the `mc-fd-dist` stack |
| The app's settings and the backup key | `/opt/mc-fd-dist/.env` on the server, readable by root only |
| The role GitHub releases with | Variable `AWS_DEPLOY_ROLE_ARN` of the GitHub `production` environment. It is not a secret. |

**[SPEC]**
- Sign in to AWS as an IAM user with MFA. Keep the root user for account-level tasks only.
- On the server, use the browser SSH client in the Lightsail console. SSH from anywhere else is closed, except to a GitHub runner during a release.

---

## 2. Current status

**[?]**
- The prototype runs on the Lightsail server, released from GitHub (section 4). The nightly backup timer has run once on its own and reached S3.
- Until the food bank has a hostname, the prototype uses `32-189-213-183.sslip.io`. sslip.io is a free public DNS service that answers with the IP address written in the name, so Caddy can get a real certificate without any DNS set-up. It gives no guarantees, so replace it with the real hostname before going live.
- The first release on Chainguard's image (ADR 0027) has not yet run against the live data. The app still runs as user 1000, so the existing data volume stays writable, and `release.sh` backs up first and goes back if the new image is not healthy.
- A restore drill onto the same server has been done (section 6). A drill onto a new server has not.
- Alerts for downtime and missing backups have not been set up. Only the monthly budget warning reports anything.

---

## 3. First start on a new server

**[SPEC]**
1. Point the site's DNS record at the stack's `StaticIpAddress` output.
2. Create an access key for the stack's backup user (`BackupWriterUserName` output) in the IAM console.
3. On the server, edit `/opt/mc-fd-dist/.env` from `.env.example`: `SITE_ADDRESS`, `ACME_EMAIL`, `BACKUP_BUCKET`, `AWS_REGION` and the key. Keep the file at `chmod 600`.
4. Start the app: `cd /opt/mc-fd-dist && docker compose up -d`.
5. Create the station logins and the first admin:
   `docker compose exec app node dist/server/cli/account.js front-desk front_desk` (and the same for `distribution`, and an admin with role `admin`).
6. Open the site, sign in, and check that it shows a padlock (HTTPS).
7. Run `./backup.sh` once and confirm the file appears in S3.

**[NOTE]**
The server's launch script already installed Docker, swap, automatic security updates and the nightly backup timer (`deploy/server-setup.sh`).

---

## 4. Updating the app

**[SPEC]**
GitHub releases each commit on main after CI passes (ADR 0022):
1. The **Deploy** workflow waits for approval. Open it in the Actions tab and choose **Review deployments**, then **Approve and deploy**.
2. It does not release during shifts: Monday, Tuesday, Thursday and Friday 7am–2pm, and Wednesday 1pm–8pm, Phoenix time. If you approve during a shift, the job waits until the shift ends and then releases. A job can wait about 5 hours 40 minutes, so an approval before about 8:20am (Wednesday: 2:20pm) fails at once and says when to approve again. While a job waits, it holds the release slot: a newer commit's **Deploy** queues behind it, so the older commit goes out first and the newer one then needs its own approval. To release during a shift, run **Deploy** by hand from the Actions tab with **force** ticked.
3. It applies `deploy/aws/stack.yaml` to the stack, and stops if any resource would be replaced or removed.
4. On the server, `release.sh` backs the database up to S3, runs the image for that commit, and goes back to the previous image if the new one is not healthy.

**[SPEC]**
- To go back to an earlier version, re-run that commit's **Deploy** run from the Actions tab.
- `/opt/mc-fd-dist/release-commit` holds the commit now running.

**[SPEC]**
To release by hand, for example when GitHub is down, use the Lightsail browser SSH client:
```sh
cd /opt/mc-fd-dist
sudo ./release.sh <full commit hash>
```

**[SPEC]**
One-time set-up of release access, by an administrator with their own AWS sign-in:
1. Create the release access stack:
   ```sh
   aws cloudformation deploy --profile mc-fd-dist --stack-name mc-fd-dist-github-deploy \
     --template-file deploy/aws/github-deploy.yaml --capabilities CAPABILITY_NAMED_IAM
   ```
2. Copy its `DeployRoleArn` output into the `AWS_DEPLOY_ROLE_ARN` variable of the GitHub `production` environment.
3. In that environment, require a reviewer, allow deployments from `main` only, and do not let administrators bypass the rules.

**[BUG] A release stops at "Stack change refused"**
Symptom: The **Update the stack** step lists a resource that would be replaced or removed.
Cause: The change to `stack.yaml` cannot be made in place. Changing the server's launch script replaces the server, and the live database with it.
Fix: Back up the database, then make the change by hand. The stack's CloudFormation role cannot delete the server, so an administrator first widens it in `github-deploy.yaml`, applies the change, and narrows it again. To replace the server, also give the stack's `ServerName` parameter a new value, because CloudFormation cannot replace a resource that keeps its name. The static IP moves to the new server.

**[BUG] A release goes back because partner batches exist**
Symptom: A release that includes migration 6 (ADR 0023) goes back to the previous image. The **Release on the server** step ends with `dependency failed to start: container mc-fd-dist-app-1 is unhealthy`, followed by `Going back to` the previous image. The app's log says the database holds partner batches, which cannot become cards.
Cause: Migration 6 drops the old Door Dash and Helping Hands batches and refuses to run while any exist, because a batch has no card numbers or sizes.
Fix: Stop and decide with the developer before releasing again. The batches must be re-entered by hand as Door Dash or Helping Hands cards, then deleted. The database is not changed by the refused migration.

**[BUG] A release left SSH open**
Symptom: The server's networking tab shows port 22 open to an address other than the Lightsail browser client.
Cause: The release job was killed before it put the port rules back.
Fix: The next release puts them back. To fix it at once, delete the extra port 22 rule in the Lightsail console's networking tab.

---

## 5. Backups

**[SPEC]**
- Nightly at 02:00 Phoenix time, a systemd timer runs `backup.sh`.
- Each backup is made with SQLite's backup method, integrity-checked, and uploaded to S3.
- S3 keeps backups for 365 days. After 30 days they move to Glacier Instant Retrieval, which still restores at once.
- Overwritten versions are kept as long as current ones, so a stolen backup key cannot quietly replace the history.
- Copies on the server are kept for 7 days.
- Lightsail also takes a snapshot of the whole server at 04:00 Phoenix time.

**[NOTE]**
The backup key on the server can add and read backups, but not list or delete them. To see which backups exist, use the S3 console or an admin's own credentials.

---

## 6. Restoring

**[SPEC]**
1. Find the backup's file name in S3, under `nightly/`, for example `mc-fd-dist-2026-11-07T090000Z.db`.
2. On the server: `cd /opt/mc-fd-dist && ./restore.sh <file name>`.
3. The script stops the app, checks the backup, keeps the replaced database beside it, and restarts the app.
4. Sign in and compare the totals with what you expect.

**[SPEC]**
- To rebuild a lost server: create the stack again, or a new server from a Lightsail snapshot, then follow section 3 and restore the latest backup.

**[SPEC]**
Restore drill, 2026-11-09, on the running server:
1. A backup was taken, then an account (`drill-test`) was added after it.
2. The server's own copy of the backup was deleted, so the restore had to download it from S3 with the server's backup key.
3. `./restore.sh` restored it. The script reported schema version 5 with no shifts or cards, and the app became healthy.
4. The `front-desk` account signed in, and `drill-test` could not, which shows the database was replaced.

**[?]**
- The drill restored onto the same server. A full drill on a new server has not been done yet: set a server up as in section 3, then restore the latest backup from S3. A new server setting itself up has been seen working (it was replaced on 2026-11-08), and so has a restore from S3, but not both together. Do it before the app goes live, and then regularly.

---

## 7. During a shift

**[BUG] The site is down during a shift**
Symptom: Stations show **Connection lost** for more than a few minutes, and the site does not load from another device.
Cause: The server, Caddy, DNS, the network at the food bank, or AWS.
Fix: Switch the shift to the paper sheets. Then check `docker compose ps` and `docker compose logs --tail=100` on the server. After the shift, enter the paper records in the app and close the shift.

**[BUG] The nightly backup failed**
Symptom: No new file under `nightly/` in S3 for the previous night.
Cause: Usually a missing or wrong value in `.env`, or the app was not running.
Fix: On the server, run `systemctl status mc-fd-dist-backup.service` and `journalctl -u mc-fd-dist-backup.service`, correct the cause, then run `./backup.sh` by hand.

**[BUG] A station password has leaked**
Symptom: Someone outside the food bank knows a station password.
Cause: The password was written down or passed on.
Fix: An admin changes it on the Admin screen. That ends the station's sessions everywhere. Sign the station devices in again.

---

## 8. Handing the AWS account to the food bank

**[SPEC]**
1. Change the root user's email to a mailbox the food bank controls.
2. Register the food bank's MFA device on the root user, then remove the developer's.
3. Add the food bank's payment method and remove the developer's.
4. Create IAM users for the staff owner, and for the developer if they still maintain the app.
5. Update the budget warning's email address.
6. Record where the account details are kept, in the staff runbook.

**[NOTE]**
ADR 0015 explains why one account serves as both prototype and production.
