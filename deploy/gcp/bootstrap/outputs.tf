# The values the gcp-trial GitHub environment needs. See docs/developer/operations.md.

output "workload_identity_provider" {
  description = "GCP_WORKLOAD_IDENTITY_PROVIDER"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deploy_service_account" {
  description = "GCP_DEPLOY_SERVICE_ACCOUNT"
  value       = google_service_account.github_deploy.email
}

output "stack_service_account" {
  value = google_service_account.im_stack.email
}

output "vm_service_account" {
  value = google_service_account.vm.email
}
