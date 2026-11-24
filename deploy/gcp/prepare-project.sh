#!/usr/bin/env bash
# Prepares the Google project for the trial server (ADR 0037). The maintainer runs it once,
# from the repository's root, signed in with gcloud as an owner of the project. It is safe to
# run again. It enables the APIs, creates im-bootstrap (the account Infrastructure Manager
# applies deploy/gcp/bootstrap as) and applies that bootstrap. Only the project's owners may
# act as im-bootstrap; the release pipeline never can.
#   deploy/gcp/prepare-project.sh <project id>
set -euo pipefail

project="${1:?Usage: prepare-project.sh <project id>}"
if ! [[ "$project" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  echo "Not a project ID (the lowercase ID, not the display name): $project" >&2
  exit 2
fi
region=us-west1
bootstrap="im-bootstrap@$project.iam.gserviceaccount.com"

if [ "$(gcloud billing projects describe "$project" --format='value(billingEnabled)')" != True ]; then
  echo "Billing is not enabled on $project. Link a billing account first." >&2
  exit 1
fi

gcloud services enable --project "$project" \
  compute.googleapis.com iap.googleapis.com oslogin.googleapis.com \
  config.googleapis.com cloudbuild.googleapis.com storage.googleapis.com \
  iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  cloudresourcemanager.googleapis.com

if ! gcloud iam service-accounts describe "$bootstrap" --project "$project" > /dev/null 2>&1; then
  gcloud iam service-accounts create im-bootstrap --project "$project" \
    --display-name "Infrastructure Manager: bootstrap"
fi

# A new service account can take a few seconds to be usable in a policy.
grant() {
  for attempt in $(seq 6); do
    gcloud projects add-iam-policy-binding "$project" --member "serviceAccount:$bootstrap" \
      --role "$1" --condition None --quiet > /dev/null && return 0
    [ "$attempt" = 6 ] && return 1
    sleep 10
  done
}
for role in roles/config.agent roles/iam.serviceAccountAdmin \
  roles/iam.workloadIdentityPoolAdmin roles/resourcemanager.projectIamAdmin; do
  grant "$role"
done

gcloud infra-manager deployments apply \
  "projects/$project/locations/$region/deployments/mc-fd-dist-bootstrap" \
  --service-account "projects/$project/serviceAccounts/$bootstrap" \
  --local-source deploy/gcp/bootstrap \
  --tf-version-constraint "=1.5.7" \
  --input-values "project_id=$project"

number="$(gcloud projects describe "$project" --format='value(projectNumber)')"
cat <<EOF

The bootstrap is applied. Set these variables on the gcp-trial environment in GitHub:
  GCP_PROJECT_ID=$project
  GCP_WORKLOAD_IDENTITY_PROVIDER=projects/$number/locations/global/workloadIdentityPools/github/providers/github
  GCP_DEPLOY_SERVICE_ACCOUNT=github-deploy@$project.iam.gserviceaccount.com
EOF
