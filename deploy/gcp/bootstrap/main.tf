# The Google counterpart of deploy/aws/github-deploy.yaml. The maintainer applies it through
# Infrastructure Manager as the im-bootstrap service account (deploy/gcp/prepare-project.sh),
# and the release pipeline can't change it. It creates:
# - the link that lets this repository's gcp-trial environment sign in without a key;
# - github-deploy, the account Deploy signs in as;
# - im-stack, the narrower account Infrastructure Manager runs the stack as;
# - mc-fd-dist-vm, the account the server runs as, with no roles (backups come later).
# See ADR 0037.

terraform {
  required_version = "~> 1.5.0" # Infrastructure Manager's free tier runs 1.5.7 at most
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.12"
    }
  }
}

provider "google" {
  project = var.project_id
}

locals {
  deploy_member = "serviceAccount:${google_service_account.github_deploy.email}"
  stack_member  = "serviceAccount:${google_service_account.im_stack.email}"
}

# GitHub's tokens name the repository and its owner by number as well as by name. The numbers
# never change, so a renamed or recreated repository can't take over this trust.
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  # checkov:skip=CKV_GCP_125: the condition pins the sub claim exactly, but in GitHub's owner@id/repo@id form, which this check's owner/repo pattern does not recognize.
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub Actions"
  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.repository_id" = "assertion.repository_id"
    "attribute.environment"   = "assertion.environment"
  }
  # The subject is the same one the AWS role trusts (deploy/aws/github-deploy.yaml), with this
  # environment. The separate checks repeat it claim by claim.
  attribute_condition = join(" && ", [
    "assertion.sub == '${var.github_subject_repository}:environment:${var.github_environment}'",
    "assertion.repository_owner_id == '${var.github_owner_id}'",
    "assertion.repository_id == '${var.github_repository_id}'",
    "assertion.environment == '${var.github_environment}'",
  ])
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "github_deploy" {
  account_id   = "github-deploy"
  display_name = "Deploy workflow (gcp-trial)"
}

resource "google_service_account" "im_stack" {
  account_id   = "im-stack"
  display_name = "Infrastructure Manager: the app's stack"
}

resource "google_service_account" "vm" {
  account_id   = "mc-fd-dist-vm"
  display_name = "The trial server"
}

# Only tokens that passed the provider's condition can act as github-deploy.
resource "google_service_account_iam_member" "github_can_deploy" {
  service_account_id = google_service_account.github_deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository_id/${var.github_repository_id}"
}

# Deploy applies the stack through Infrastructure Manager, which runs it as im-stack. The
# editor role can create and update deployments but not change who may use them.
resource "google_project_iam_member" "deploy" {
  for_each = toset([
    "roles/config.editor",
    "roles/compute.viewer", # finds the server and reads its host keys; gcloud needs it here
  ])
  project = var.project_id
  role    = each.value
  member  = local.deploy_member
}

# The project may hold other machines, so sign-in is limited to the trial server and the
# tunnel to SSH. OS Login refuses github-deploy anywhere else.
resource "google_project_iam_member" "deploy_admin_on_server" {
  project = var.project_id
  role    = "roles/compute.osAdminLogin" # sudo on the server, as AWS's one-time key gives
  member  = local.deploy_member
  condition {
    title      = "The trial server only"
    expression = "resource.name == \"projects/${var.project_id}/zones/${var.zone}/instances/${var.server_name}\""
  }
}

resource "google_project_iam_member" "deploy_tunnels_ssh" {
  project = var.project_id
  role    = "roles/iap.tunnelResourceAccessor"
  member  = local.deploy_member
  condition {
    title      = "SSH only"
    expression = "destination.port == 22"
  }
}

resource "google_service_account_iam_member" "deploy_runs_stack" {
  service_account_id = google_service_account.im_stack.name
  role               = "roles/iam.serviceAccountUser"
  member             = local.deploy_member
}

# OS Login checks this on every connection to a server that runs as a service account.
resource "google_service_account_iam_member" "deploy_signs_in_to_vm" {
  service_account_id = google_service_account.vm.name
  role               = "roles/iam.serviceAccountUser"
  member             = local.deploy_member
}

# im-stack can manage the server, its address, its network and its firewall, and nothing
# that grants access. It can't create service accounts or change project IAM, so a deploy
# can't widen its own rights through it.
resource "google_project_iam_member" "stack" {
  for_each = toset([
    "roles/config.agent",
    "roles/compute.instanceAdmin.v1",
    "roles/compute.networkAdmin",
    "roles/compute.securityAdmin",
  ])
  project = var.project_id
  role    = each.value
  member  = local.stack_member
}

resource "google_service_account_iam_member" "stack_attaches_vm_account" {
  service_account_id = google_service_account.vm.name
  role               = "roles/iam.serviceAccountUser"
  member             = local.stack_member
}
