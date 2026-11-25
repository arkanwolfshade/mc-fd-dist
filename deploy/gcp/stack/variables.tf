variable "project_id" {
  type        = string
  description = "The Google project's ID, not its display name."
}

variable "region" {
  type    = string
  default = "us-west1" # Oregon, in the free tier and nearest to Phoenix
}

variable "zone" {
  type    = string
  default = "us-west1-b"
}

variable "setup_commit" {
  type        = string
  description = "Git commit whose deploy folder a new server is set up from."
  validation {
    condition     = can(regex("^[0-9a-f]{40}$", var.setup_commit))
    error_message = "setup_commit must be a full 40-character commit hash."
  }
}

variable "vm_service_account_email" {
  type        = string
  description = "The server's own service account, from the bootstrap deployment."
}
