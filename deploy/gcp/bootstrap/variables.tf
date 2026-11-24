variable "project_id" {
  type        = string
  description = "The Google project's ID, not its display name."
}

variable "github_owner_id" {
  type        = string
  default     = "23161760"
  description = "The number GitHub gives the repository's owner."
}

variable "github_repository_id" {
  type        = string
  default     = "1448960738"
  description = "The number GitHub gives the repository."
}

variable "github_environment" {
  type        = string
  default     = "gcp-trial"
  description = "The only GitHub environment that may deploy here."
}
