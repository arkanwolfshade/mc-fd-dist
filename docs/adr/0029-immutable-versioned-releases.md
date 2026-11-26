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

*Amended 2026-11-24:* the server pulls two other images, and they are pinned too.

- **Pinned by digest:** `deploy/compose.yaml` runs Caddy and the AWS CLI by version and digest (`caddy:2.11.9@sha256:...`), not by a floating tag that could point elsewhere when a server is built or a backup restored. `tools/compose-images.test.ts` fails if either goes back to a floating tag.
- **Dependabot moves them:** its `docker-compose` ecosystem already watches `/deploy`, and its parser reads a tag followed by a digest. Its pull request is the review point, and CI starts the new Caddy image in the container job (`deploy/dast.sh`). The AWS CLI image is only used for backups and restores, so CI does not start it. That Dependabot rewrites the digest as well as the tag is read from its source, and is confirmed by its first pull request here.
- **Neither can be verified:** checked on 2026-11-24, neither image has a cosign signature or any referrer in the registry. Caddy's official image carries BuildKit provenance and SBOM attestations inside its image index, which are not signed. The AWS CLI image carries none. A new digest is therefore trusted as Docker Hub serves it, after review of the pull request. Look again if either publisher starts signing.
- **Not checked:** how long Docker Hub keeps a superseded digest of these two images pullable. If one disappears, a release or a restore stops at the pull, and the fix is a pull request that moves the pin to the current digest.
- The AWS CLI image is released almost daily, so its pull request will come most weeks.

*Amended 2026-11-25:* every published image carries an SBOM attestation.

- **CI attests it:** the `publish` job makes an SBOM of each image it pushes (Syft, SPDX JSON) and attests it to the image's digest with `actions/attest`, stored in the registry beside the build attestation. Images from `main` that never become releases have one too.
- **Release takes that one:** it no longer makes a second SBOM. It takes the document from the image's attestation, checked as signed by this repository's `ci.yml`, and publishes it as `sbom.spdx.json`. The release's file and the image's SBOM are therefore the same document. Release refuses an image that has no such attestation, and says why.
- **Deploy does not check it:** Deploy still checks the release and the image's build attestation, and the release's own attestation already covers `sbom.spdx.json`. Asking for the SBOM attestation too would make every release cut before this change undeployable, so a rollback could not go back past it.
- **Older images are refused by Release:** checked on 2026-11-25, the image of `v0.5.1` has no SBOM attestation. The first release after this change must be of a commit that CI built after it.
- **What the SBOM lists:** the one of `v0.5.1` names 302 packages (273 npm, 28 apk, the base image). It includes `preact`, the app's only client runtime dependency, because it is in `dependencies` and so is copied into the image's `node_modules`. The build-only tools (Vite, marked) are absent. Client code that Vite bundled into `dist/client` carries no package metadata of its own, so the SBOM names the package, not the bundled copy.
- **Not decided:** adding CycloneDX (nobody has asked for it), and checking the SBOM against a policy at deploy (Grype already scans the image in CI).

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
