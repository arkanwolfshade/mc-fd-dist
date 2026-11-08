# Operations runbook
**Version 1.0.0** · mc-fd-dist · 2026-11-08 · For the maintainer and the staff owner

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
| Container image | `ghcr.io/arkanwolfshade/mc-fd-dist`, tagged with each commit and `latest` |
| AWS account | A standalone account for this app alone, to be handed to the food bank (ADR 0015) |
| Region | `us-west-2` (Oregon) |
| Infrastructure | CloudFormation stack `mc-fd-dist`, from `deploy/aws/stack.yaml` |
| Server | Lightsail instance `mc-fd-dist`, Ubuntu 24.04, app files in `/opt/mc-fd-dist` |
| Backups | The stack's S3 bucket, under `nightly/` |

**[SPEC]**
- Sign in to AWS as an IAM user with MFA. Keep the root user for account-level tasks only.
- On the server, use the browser SSH client in the Lightsail console. SSH from anywhere else is closed.

---

## 2. Current status

**[?]**
- The stack and server exist, but the app has not been started on them yet.
- Still needed: the site's hostname and its DNS record, the backup key in `.env`, a first restore drill.
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
```sh
cd /opt/mc-fd-dist
./backup.sh --local-only     # a copy on the server, in case the update must be undone
docker compose pull
docker compose up -d
docker compose ps            # the app should become "healthy"
```

**[SPEC]**
- Update outside shift hours.
- To pin a version, set `APP_IMAGE` in `.env` to an image tagged with a commit instead of `latest`.

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

**[?]**
- A full restore drill on a new server has not been done yet. It must be done before the app goes live, and then regularly.

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
