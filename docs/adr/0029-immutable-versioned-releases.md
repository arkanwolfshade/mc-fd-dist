# 0029. Cut immutable, versioned releases and deploy only releases

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Every merge to `main` that passed CI published an image tagged with its commit hash, and started a Deploy run that waited for the maintainer's approval. There were no tags, no version numbers and no release notes, and production was whatever commit was approved last. A busy day left a pile of pending and cancelled Deploy runs.

GitHub's immutable releases are switched on for the repository. Once a release is published, its tag and files cannot be changed, a tag used by one can never be used again, and GitHub signs an attestation that `gh release verify` checks. Container registry tags, by contrast, can be moved.

## Decision

- **Releases are cut by hand.** The maintainer runs the **Release** workflow with a version. It checks the version, finds the commit's image, writes the release notes, and publishes a release. It starts as a dry run, which publishes nothing, because a published release cannot be undone.
- **Versions are SemVer, from `v0.1.0`.** The tag is the source of truth. `package.json` is not read by anything and is not kept in step. Each version must be new and higher than every existing one. `v1.0.0` can mark the real go-live.
- **Build once, promote.** A release does not rebuild. It names the image CI already built, tested and scanned for that commit, and adds the version as a tag on that same image.
- **The image carries proof.** CI attests where each published image was built. The Release workflow refuses a commit whose image does not carry that attestation from this repository's CI workflow. Each release has two files: `image.txt`, the image's name by digest, and an SBOM (`sbom.spdx.json`).
- **Production deploys only releases, by digest.** The Deploy workflow takes a version, verifies the release and the image's attestation, and the server runs the image by its digest, which cannot move. Rollback is deploying an earlier version. The approval, the wait for a window outside shift hours, and the backup before a release are unchanged (ADR 0022).

## Alternatives considered

- **A release bot (release-please):** more automatic, but it adds a third-party action and picks the version from Conventional Commit titles, and not every title here has a prefix.
- **A release on every merge:** documentation-only merges would become releases, several a day.
- **Keep deploying every commit, with releases as a record:** production would not be tied to a release, and the approval noise would stay.
- **Calendar versions:** they say when a release was cut but not what changed.
- **Signing images with cosign:** GitHub's attestation gives the same assurance for a public repository with no extra tool.

## Consequences

- A published release is permanent, and so is its version number. A wrong one is fixed by releasing a higher one. The dry run, and publishing as the last step, exist for this.
- Production changes only when the maintainer cuts a release and approves its deployment, so a fix reaches the food bank in two steps instead of one. Merges that are not releases never reach it.
- Registry tags are still movable, so the version tag on the image is a convenience. Production runs the digest.
- The first release must be of a commit built after CI began attesting images, because older images carry no attestation.
- Release notes are only as good as the pull request titles they list.
- A deploy uses the scripts and templates of the release's own commit, as they were when it was cut. `v0.1.0` and `v0.1.1` were cut before the deploy scripts took a version and a digest, so they cannot be deployed. The first deployable release is the next one. ADR 0022 is amended accordingly.
