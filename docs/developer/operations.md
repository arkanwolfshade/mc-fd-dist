# Operations runbook
**Version 1.10.0** · mc-fd-dist · 2026-11-24 · For the maintainer and the staff owner

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
| Security baseline | CloudFormation stack `mc-fd-dist-security-baseline`, from `deploy/aws/security-baseline.yaml`: a CloudTrail trail, its log bucket and an Access Analyzer (ADR 0036) |
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
   `docker compose exec app node dist/server/cli/account.js front-desk front_desk` (and the same for `distribution`, and an admin with role `admin`). The wall display in the distribution room has its own role, `display`, made the same way. It can read the queue and nothing else (ADR 0033).
6. Open the site, sign in, and check that it shows a padlock (HTTPS).
7. Run `./backup.sh` once and confirm the file appears in S3.

**[NOTE]**
The server's launch script already installed Docker, swap, automatic security updates and the nightly backup timer (`deploy/server-setup.sh`).

---

## 4. Updating the app

**[SPEC]**
A release is cut, then deployed (ADRs 0022 and 0029):
1. In the Actions tab, run **Release** from `main` with the new version, for example `0.2.0`. Leave **Dry run** ticked the first time: it publishes nothing and shows the release notes. Run it again with **Dry run** unticked to publish. A published release and its version can never be changed or reused.
2. Publishing starts **Deploy** for that version, with **target** `aws`. Its first job checks the release and that its image carries this repository's build attestation. Only then does the deploy wait for approval: open it in the Actions tab and choose **Review deployments**, then **Approve and deploy**.
3. It does not deploy during shifts: Monday, Tuesday, Thursday and Friday 7am–2pm, and Wednesday 1pm–8pm, Phoenix time. If you approve during a shift, the job waits until the shift ends and then releases. A job can wait about 5 hours 40 minutes, so an approval before about 8:20am (Wednesday: 2:20pm) fails at once and says when to approve again. While a job waits, it holds the release slot: a newer commit's **Deploy** queues behind it, so the older commit goes out first and the newer one then needs its own approval. To deploy during a shift, run **Deploy** by hand from the Actions tab with the version, **target** `aws` and **force** ticked.
4. It applies `deploy/aws/stack.yaml` to the stack, and stops if any resource would be replaced or removed.
5. On the server, `release.sh` backs the database up to S3, runs the release's image by its digest, and goes back to the previous image if the new one is not healthy.

**[SPEC]**
- To go back to an earlier version, run **Deploy** by hand with that release's version and **target** `aws`. Only releases cut after the deploy workflow changed to use versions can be deployed. An earlier version does not start on a database that a later release changed; see the bug below.
- `/opt/mc-fd-dist/release-version` holds the version and image digest now running.

**[SPEC]**
After a release, check it on the live site outside shift hours (about 10 minutes). `/api/health` answering `{"status":"ok"}` only shows that the app started. A browser keeps one login per site, so use three different browsers or devices for the front desk, distribution and wall display. Card numbers 901 to 903 stand out from real cards, and `ZZ` as the initials marks the test.
1. On the wall display's device, sign in as the display login (section 7). It says **Distribution queue**, today's date and **No shift is open today**, or **No families are waiting** if a shift is open.
2. On the front desk, sign in and choose **Open today's shift** if none is open. The wall says **No families are waiting** within a few seconds.
3. On the front desk, add card 901 (5 people, East, Senior Box, note `SMOKE TEST`), card 902 (2 people, Walk) and card 903 (4 people, Bus), each with initials `ZZ`. The wall still says nobody is waiting, because nobody has been called.
4. Press **Call back** on card 903, then 901, then 902. The wall's **Called (3)** lists 903, 901, 902: the order called, not the order of the numbers. Card 901 shows `5 people · 2 carts` and a Senior Box badge. Neither `SMOKE TEST` nor `ZZ` appears anywhere on the wall.
5. On the distribution tablet, the queue lists the same order: 903, 901, 902.
6. On distribution, choose **Confirm** on card 903. The wall shows **Confirmed (1)** with 903, and **Called (2)** with 901 and 902.
7. On the front desk, press **Undo call back** on card 901. It leaves the wall. Call it again, and it returns below 902.
8. On distribution, enter a weight for card 903 and choose **Mark distributed**. It leaves the wall.
9. In a new tab on the wall's device, open `/api/shifts?date=` followed by today's date as year-month-day. It answers `{"error":"Not allowed"}`, which shows the wall cannot read full cards.
10. Turn Wi-Fi off on the wall's device for about 40 seconds. It switches to a full-screen **Not connected** with the time it last updated, and shows no queue. Turn Wi-Fi on, and the queue returns within about 30 seconds.
11. A station that was signed in before the release is still signed in, without asking for a password.
12. Clean up: an admin deletes the test cards on the Admin screen, and the wall says **No families are waiting** again. A shift cannot be deleted, so close it from distribution's **Finish** panel if it was opened only for this test.

**[?]**
Steps 1 to 10 were written for v0.3.0 and have not been run yet. Record the date, the version and anything that failed here when they are. If a step fails, do not restore a backup before deciding with the developer: section 6 explains how, and a release's backup is the `nightly/` file that `release.sh` uploaded before the release (it is named in the Deploy job's log).

**[SPEC]**
To release by hand, for example when GitHub is down, use the Lightsail browser SSH client:
```sh
cd /opt/mc-fd-dist
sudo ./release.sh <version> <image digest>   # for example v0.2.0 sha256:...
```

**[SPEC]**
The image digest is in the release's `image.txt`, on its page under Releases.

**[SPEC]**
One-time set-up of release access, by an administrator with their own AWS sign-in:
1. Create the release access stack:
   ```sh
   aws cloudformation deploy --profile mc-fd-dist --stack-name mc-fd-dist-github-deploy \
     --template-file deploy/aws/github-deploy.yaml --capabilities CAPABILITY_NAMED_IAM
   ```
2. Copy its `DeployRoleArn` output into the `AWS_DEPLOY_ROLE_ARN` variable of the GitHub `production` environment.
3. In that environment, require a reviewer, allow deployments from `main` only, and do not let administrators bypass the rules.

**[SPEC]**
The security baseline (ADR 0036) is applied by an administrator with their own AWS sign-in, never by GitHub, so a release cannot switch it off. A merged change to `security-baseline.yaml` does nothing until someone applies it:
1. Apply it. It creates no IAM resources, so it needs no capabilities:
   ```sh
   aws cloudformation deploy --profile mc-fd-dist --region us-west-2 \
     --stack-name mc-fd-dist-security-baseline --template-file deploy/aws/security-baseline.yaml
   ```
2. Check the trail: `aws cloudtrail get-trail-status --name mc-fd-dist-trail --profile mc-fd-dist --region us-west-2` shows `IsLogging` as `true`. Log files appear in the stack's bucket (the `TrailBucketName` output) under `AWSLogs/` within about 15 minutes.
3. Check the analyzer: `aws accessanalyzer list-analyzers --profile mc-fd-dist --region us-west-2` lists `mc-fd-dist-external-access` as `ACTIVE`. Its findings are in the IAM console under Access Analyzer, and an empty list means nothing in `us-west-2` is shared outside the account.
4. The template cannot set one thing, so do it once in the S3 console, under Block Public Access settings for this account: turn on all four settings. New buckets already have them on by default, so this covers a bucket made some other way.

**[NOTE]**
The security baseline is a separate stack from `stack.yaml` on purpose. The role that releases use is narrow, so it cannot change the trail, its bucket or the analyzer. The trail records management events only, the first copy of which AWS says is free. Only the storage of its log files is charged.

**[?]**
- The baseline has not been applied yet. Record the date and anything that went wrong here when it is.
- The log files' size, and so their cost, has not been measured. Look at the S3 line of the next month's bill after applying it.
- Nothing alarms on the trail or the analyzer. Someone has to look at them.

**[BUG] A release stops at "Stack change refused"**
Symptom: The **Update the stack** step lists a resource that would be replaced or removed.
Cause: The change to `stack.yaml` cannot be made in place. Changing the server's launch script replaces the server, and the live database with it.
Fix: Back up the database, then make the change by hand. The stack's CloudFormation role cannot delete the server, so an administrator first widens it in `github-deploy.yaml`, applies the change, and narrows it again. To replace the server, also give the stack's `ServerName` parameter a new value, because CloudFormation cannot replace a resource that keeps its name. The static IP moves to the new server.

**[BUG] A release goes back because partner batches exist**
Symptom: A release that includes migration 6 (ADR 0023) goes back to the previous image. The **Release on the server** step ends with `dependency failed to start: container mc-fd-dist-app-1 is unhealthy`, followed by `Going back to` the previous image. The app's log says the database holds partner batches, which cannot become cards.
Cause: Migration 6 drops the old Door Dash and Helping Hands batches and refuses to run while any exist, because a batch has no card numbers or sizes.
Fix: Stop and decide with the developer before releasing again. The batches must be re-entered by hand as Door Dash or Helping Hands cards, then deleted. The database is not changed by the refused migration.

**[BUG] An earlier version does not start after a release changed the database**
Symptom: Going back to an earlier version does not become healthy. After an automatic return, `release.sh` ends with `The previous image is not healthy either`, and the site is down. The app's log says the database was made by a newer version of the app.
Cause: A release that adds a migration changes the database, and an earlier version refuses to start on a database it does not know, rather than write to it.
Fix: Restore the backup that `release.sh` took before the newer release (section 6), then deploy the earlier version again. Anything entered after that backup is lost, so if the newer release ran for a while, decide with the developer whether to fix it forward instead.

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
- `BACKUP_UPLOAD=off` in `.env` keeps backups on the server only. It is for a server with test data alone, never this one: leave it unset or `on` (ADR 0037).
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

**[SPEC]**
Try the app on the real devices before the first shift, and again when the devices change. The browser tests emulate phones and tablets (ADR 0031), but they cannot show these. Do each on an iPhone or iPad in Safari, and on an Android phone in Chrome, signed in as each station:
1. Install the app to the home screen, open it from there, and sign in.
2. Enter a card. Check that the on-screen keyboard does not hide the field being typed in or the Save card button.
3. Turn the device sideways in the middle of a card, then back. Check that nothing typed is lost.
4. Lock the screen for a minute, then unlock it. Check that the station says it is connected again and shows a card entered meanwhile on another device.
5. Turn on airplane mode, enter a card, then turn it off. Check that the card is sent once, and none is lost or doubled.
6. Turn on airplane mode, close the app, and open it again. Check that it opens with its fonts and the saved shift. Then open Help and check that each missing picture shows its description.
7. On iOS, set Larger Text to its biggest sizes (Settings, Accessibility, Display & Text Size). Check that every button can still be reached and tapped.

**[?]**
This checklist has not been run yet. Record the date, the devices and anything that failed here when it is.

**[SPEC]**
Setting up the wall display in the distribution room (ADR 0033 and 0034):
1. On the server, create its login: `docker compose exec app node dist/server/cli/account.js wall display`, and type a password.
2. On the television's computer or stick, open the app's address in a browser, sign in as `wall`, and make the page full screen. The screen needs no mouse or keyboard after that.
3. Turn off the screen saver and sleep on that device, so that it stays on during a shift.
4. Its session lasts 90 days. Put a reminder in the staff runbook for about every three months, and see the next block for what it looks like when it ends.

**[?]**
The wall display has been tried only in an emulated browser. On the real television, check once that: the numbers can be read from the far side of the room; the queue follows the tablets within a second or two; it shows **Not connected** when the Wi-Fi is switched off for half a minute and recovers when it is switched on; and it is still on, and still signed in, after an idle night. Record the date, the television and anything that failed here.

**[BUG] The wall display shows the sign-in form**
Symptom: The screen in the distribution room asks for a username and password.
Cause: Its session ended. Sessions last 90 days (ADR 0033), or the display's password was changed.
Fix: Plug in a keyboard and sign in as the display account. If nobody has the password, an admin sets a new one on the Admin screen, and then the screen is signed in with that.

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
