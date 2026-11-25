#!/usr/bin/env bash
# Applies deploy/gcp/stack through Infrastructure Manager, which runs it as im-stack. The
# deploy workflow runs this before each release; the maintainer runs it once by hand to make
# the first server. A new server is set up from <release commit>; on a running server only its
# startup script changes, which does nothing because setup has already run.
#   update-stack.sh <project id> <release commit> <release tag>
set -euo pipefail

usage="Usage: update-stack.sh <project id> <release commit> <release tag>"
project="${1:?$usage}"
commit="${2:?$usage}"
tag="${3:?$usage}"
if ! [[ "$project" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  echo "Not a project ID: $project" >&2
  exit 2
fi
if ! [[ "$commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Not a full commit hash: $commit" >&2
  exit 2
fi
if ! [[ "$tag" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo "Not a release tag like v0.5.1: $tag" >&2
  exit 2
fi
region=us-west1

# Infrastructure Manager fetches the Terraform itself from the public repository, at the
# release's tag, which can't move because releases are immutable. Nothing is uploaded from
# here, so the deploy account needs no access to storage. Waits for Terraform to finish, and
# fails if it does. gcloud wants the project as a flag too, even though the name contains it.
gcloud infra-manager deployments apply \
  "projects/$project/locations/$region/deployments/mc-fd-dist-stack" \
  --project "$project" \
  --service-account "projects/$project/serviceAccounts/im-stack@$project.iam.gserviceaccount.com" \
  --git-source-repo "https://github.com/arkanwolfshade/mc-fd-dist.git" \
  --git-source-directory deploy/gcp/stack \
  --git-source-ref "$tag" \
  --tf-version-constraint "=1.5.7" \
  --input-values "project_id=$project,setup_commit=$commit,vm_service_account_email=mc-fd-dist-vm@$project.iam.gserviceaccount.com"
echo "The stack is updated."
