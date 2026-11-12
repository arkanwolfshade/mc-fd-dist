# 0025. Require signed commits on main

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

ADR 0017 stopped main from being force-pushed or deleted, and left "require signed commits" for when every machine that commits had signing set up. Commits go straight to main (ADR 0008), from one maintainer.

That maintainer's machine now signs every commit by default with an OpenPGP key, and GitHub holds the public key, with the commit email verified on it. The app will hold a food bank's records and run on the public internet, and the author line on a commit can be set to anyone. A signature GitHub can verify shows that the maintainer's key made the commit.

The history before this decision has two unsigned commits.

## Decision

- **Rule:** The **Protect main** ruleset gets a `required_signatures` rule. GitHub rejects a push to main that contains a commit it cannot verify. The ruleset has no bypass, so this applies to everyone.
- **Key:** The maintainer signs with the ed25519 key `BEFB51A293A8FDC2`. A key ID is public. The private key is never committed (`CONTRIBUTING.md`).
- **Where signing is configured:** In each committer's own git configuration, as `commit.gpgsign` and `user.signingkey`. It is not pinned in a clone: `.git/config` is not committed, so it would not reach other clones.
- **Existing history:** The two unsigned commits stay as they are. The rule checks what is pushed, and history is not rewritten.
- **Applying it:** As with the other rulesets (ADR 0017), the file in the repository is not applied automatically. Re-import it in the repository's settings.

## Alternatives considered

- **Leave signing unenforced, as under ADR 0017:** Nothing would stop an unsigned or mislabeled commit, and the maintainer already signs everything.
- **Check signatures in CI:** CI runs after the push, so it could report an unsigned commit but could not keep it off main.
- **SSH-key signing instead of OpenPGP:** Simpler to set up on a new machine, but the OpenPGP key is already in use and on the account, so switching would gain nothing now.

## Consequences

- A push with an unsigned commit is rejected. Anyone committing from another machine sets up signing there first and adds their public key to their GitHub account.
- Losing the private key, with no bypass, means a repository admin has to edit the ruleset before anyone can push again.
- The key expires on 2027-04-03. After that, signing fails until the expiry is extended and the updated public key is uploaded to GitHub again.
- *Assumed:* GitHub cannot sign commits made by its rebase-and-merge option, so a pull request must be merged or squashed. This matters when ADR 0008 is revisited and pull requests become the normal route.
