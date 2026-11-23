# 0036. Add free AWS security features in a stack the release pipeline cannot change

- **Status:** Accepted
- **Date:** 2026-11-23

## Context

A read-only review of the AWS account on 2026-11-23 found that none of GuardDuty, Inspector, Macie, Detective, Security Hub or AWS Config was enabled in `us-west-2`, and that the account had no CloudTrail trail. Its only record of activity was CloudTrail's built-in event history. The backup bucket, the server's metadata setting, the cost anomaly monitor and the monthly budget all matched ADR 0015 or were set sensibly.

AWS's documentation says these are free: the first copy of management events on a CloudTrail trail (the log files' storage in S3 is charged), an IAM Access Analyzer for external access, and IAM Identity Center. Account-wide S3 Block Public Access has no charge that I found stated. GuardDuty and Security Hub CSPM give 30-day trials and then charge. AWS Config and a customer-managed KMS key charge from the start.

The release pipeline's CloudFormation role (`github-deploy.yaml`) is deliberately narrow: it can change only the Lightsail server, the backup bucket, the budget and the backup user, and it cannot delete the server or the backups. A CloudTrail trail, a second bucket and an analyzer are all outside it.

## Decision

- **A separate stack:** `deploy/aws/security-baseline.yaml` creates a multi-region CloudTrail trail for management events only, an S3 bucket for its log files, and an IAM Access Analyzer for external access. An administrator applies it once with their own sign-in, as with `github-deploy.yaml`, and the pipeline never touches it. A release therefore cannot stop or delete the trail that records it.
- **Logs:** the trail logs management events only, because data events are charged. Log file validation is on. The bucket is private, versioned, encrypted with S3-managed keys, kept if the stack is deleted, and allows only this trail to write to it. Logs expire after 365 days, as long as the backups are.
- **Analyzer:** an `ACCOUNT` analyzer in `us-west-2`, the region of the backup bucket. The analyzers for internal and unused access are charged, so they are not created.
- **Account-wide S3 Block Public Access:** CloudFormation has no resource for it that I could find, so an administrator sets it by hand once. It protects any bucket created some other way. New buckets already have it on by default.
- **Left out:** IAM Identity Center, which changes how people sign in and is its own decision. GuardDuty, Security Hub, Config and KMS keys, which are charged after a trial or from the start.

## Alternatives considered

- **Put the resources in `stack.yaml` and widen the pipeline's role:** this is what was first asked for. A deploy would then be able to change a trail and a bucket, and an approved but mistaken or compromised release could weaken the record of its own actions. A deny rule on stopping or deleting the trail would help, but would not cover every way to change it.
- **Enable them by hand in the console:** no template to keep up, but nothing records or reviews the change, and it cannot be repeated.
- **Use a KMS key for the logs:** a monthly charge and a key policy to maintain, for a bucket that holds no personal data. The three checkov checks it would satisfy are skipped in the template, each with a reason.
- **A single-region trail:** an attacker with stolen credentials can act in any region, and a multi-region trail's first copy of management events is still the free one.

## Consequences

- An administrator must apply the stack and, later, any change to it. The release pipeline does not keep it up to date, so a change to the template that is merged does nothing until someone applies it.
- The logs cost only S3 storage. Their size was not measured, and the first month's bill should be checked (see the runbook).
- Nothing alarms on the trail. It makes the record available. A person has to look, and CloudTrail's event history covers only recent activity.
- The analyzer covers `us-west-2` only. A bucket in another region would not appear in it.
- The trail's checkov checks for KMS, a notification topic and CloudWatch Logs are skipped with reasons. If alerting is added later, the CloudWatch Logs skip goes first.
