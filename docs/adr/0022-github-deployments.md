# 0022. Release from GitHub Actions after approval, through narrow AWS roles

- **Status:** Accepted; amended by 0029
- **Date:** 2026-11-08

## Context

ADR 0015 left releases as a manual step on the server, and its stack as a manual CloudFormation update. GitHub held no AWS access. The developer wants GitHub to do both, with only the code owner able to start or approve a release.

The server's SSH port is open only to the Lightsail console's browser client. The stack can create IAM users, so anything allowed to update it could otherwise make itself an administrator of the account. The stack's server holds the live database, and some template changes make CloudFormation replace the server. Shifts run Monday, Tuesday, Thursday and Friday from 7am to 2pm, and Wednesday from 1pm to 8pm, Phoenix time. A release restarts the app.

## Decision

- **When:** The release workflow (ADR 0029) starts the deploy workflow for each release it publishes, and the deploy workflow can be run by hand with a version, which is also how to go back to an earlier release. Its job waits in the GitHub `production` environment until a required reviewer approves it. Only main can deploy, and administrators cannot bypass the rules. After approval it first checks the release and that the image carries this repository's build attestation. An approval given during a shift makes the job wait until the shift ends and then deploy. If the shift ends more than 340 minutes away, the job fails at once and names the time to approve again. Started by hand with `force`, it deploys without waiting.
- **Access to AWS:** GitHub signs in through OpenID Connect. No AWS key is stored in GitHub. The deploy role trusts only tokens for `repo:arkanwolfshade@23161760/mc-fd-dist@1448960738:environment:production`. GitHub names the owner and repository with their numeric IDs, so a repository deleted and created again under the same name cannot deploy.
- **What GitHub may do:** The deploy role can create, inspect and run change sets on the app's stack, only as a separate CloudFormation role, and can reach the server. The CloudFormation role:
  - can change Lightsail, the backup bucket and the budget;
  - cannot delete the server, its snapshots or static IP, the bucket, any backup, or the bucket's versioning and public access block;
  - can create or change IAM users only when they carry a permissions boundary that allows nothing beyond adding and reading backups.
- **Stack changes:** The workflow keeps every parameter's current value, builds a change set, and refuses it if any resource would be replaced or removed. Those changes are made by hand, after a backup.
- **Reaching the server:** For each release, the workflow opens SSH to the runner's own address, gets a one-time key and the server's host keys from Lightsail, and puts the server's port rules back afterwards, whether or not the release worked.
- **On the server:** `deploy/release.sh` backs the database up to S3, runs the release's image by its digest, and goes back to the previous image if the new one does not become healthy.
- **Set-up:** The OpenID Connect provider and both roles are in `deploy/aws/github-deploy.yaml`. An administrator creates that stack once with their own credentials. GitHub cannot change it.

## Alternatives considered

- **The server pulls new images on a timer:** No access into the server and nothing in GitHub. It was not chosen because GitHub could neither run nor confirm a release, and stack changes would stay manual.
- **An SSH key in GitHub Secrets:** Simple, but a long-lived key, and SSH open to GitHub's large and changing address ranges.
- **A CloudFormation role with administrator access:** Never blocks a stack change. One approved mistake or one compromised action could take over the account.
- **App releases only, stack by hand:** The smallest AWS access. It was not chosen because a forgotten manual step lets the live stack drift from the repository.

## Consequences

- Every release needs an approval from the code owner, who is the only reviewer until someone else is added.
- CloudFormation uses the narrow role for every later change to the app's stack, including changes made by hand. A deliberate replacement of the server, or a new kind of AWS resource in the stack, first needs the role widened in `github-deploy.yaml` by an administrator.
- An approved template can still change the bucket's lifecycle rules, for example shortening how long backups are kept. The change set is printed in the job before it runs.
- If a job is killed before it cleans up, SSH stays open to one GitHub runner address until the next release or a manual fix.
- A job can run for 6 hours at most and a shift lasts 7, so an approval in the first hour and 20 minutes of a shift (before about 8:20am Monday, Tuesday, Thursday and Friday, or 2:20pm Wednesday) fails at once instead of waiting. The AWS role trusts only the `production` environment, so splitting the wait into a separate job would need a second approval.
- A waiting job holds the `deploy-production` concurrency group, so a newer release queues behind it. The older approved release goes out first, and the newer one then waits for its own approval. If the repository ever becomes private, the hours of waiting are billed runner minutes.
- A deploy uses the scripts and templates of the release's own commit, so a release cut before the deploy workflow took a version, such as `v0.1.0` and `v0.1.1`, cannot be deployed. The first deployable release is the next one.
- Shift times are written in `tools/deploy-window.ts` and must be changed there when the schedule changes.
- This partly supersedes ADR 0015, which had GitHub hold no AWS access.
