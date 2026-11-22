# 0030. Verify the signature of every commit in a pull request

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

ADR 0025 requires signed commits on `main`. Since ADR 0028, `main` changes only through squash merges, which GitHub signs itself. So the rule on `main` now checks GitHub's signature, not the commits a pull request is made of: an unsigned commit, or one signed by a key that is not the maintainer's, can still reach `main` inside a squash merge.

On 2026-11-22 an unsigned commit was pushed to a pull request branch from a machine that had no signing set up. Nothing flagged it. The Chainguard GitHub App, already installed for the repository, reports an **Enforce - Commit Signing** check on each pull request, but it passes as "neutral" until the repository has a policy.

## Decision

- **Policy:** `.chainguard/source.yaml` accepts a commit signed by either of two key sets: the maintainer's GPG keys published at `https://github.com/arkanwolfshade.gpg`, and GitHub's own key at `https://github.com/web-flow.gpg`, which signs Dependabot's commits and merges made on github.com.
- **Keys:** A key is accepted by being on the maintainer's GitHub account. On 2026-11-22 that is `BEFB51A293A8FDC2` (ADR 0025) and `499369E4246A7146`, added for a second machine. Adding or removing a key on the account changes the policy without a commit.
- **Enforcement:** The **Pull requests need CI** ruleset requires the **Enforce - Commit Signing** check (GitHub App 210473), beside `check`, `container` and `secrets`.
- **When it applies:** Chainguard reads the policy from `main`, so it applies to pull requests opened or updated after this decision merges.

## Alternatives considered

- **Rely on ADR 0025's rule on `main`:** It sees only GitHub's signature on the squash merge, as described above.
- **Check signatures in CI with a script:** It would need its own key list and a way to fetch keys, which Chainguard already does, and it would be one more thing to maintain.
- **List the key fingerprints in the policy:** Chainguard documents only key references by URL (`key.kms`), not inline key material. The account URL also keeps the policy in step with the keys GitHub uses to show a commit as verified.

## Consequences

- An unsigned commit, or one signed by an unknown key, fails the check, and the pull request cannot merge until the commit is re-signed. Repository administrators can still bypass the ruleset, as with the other rules.
- Anyone else who contributes needs their key added to the policy first, as an authority beside the maintainer's.
- Chainguard's commit verification is in beta, and its documentation does not say how it treats every case. That it fails a pull request with an unsigned commit has not been tested yet. Test it with a throwaway pull request once this merges, and revisit if the check stops reporting: a required check that never reports blocks every merge.
- If a key expires (`BEFB51A293A8FDC2` and `499369E4246A7146` expire in November 2027), commits signed after that fail the check until the expiry is extended and the updated key is on the account again.
