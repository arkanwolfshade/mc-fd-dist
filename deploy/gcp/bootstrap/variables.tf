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

variable "zone" {
  type        = string
  default     = "us-west1-b"
  description = "The trial server's zone, as in deploy/gcp/stack."
}

variable "server_name" {
  type        = string
  default     = "mc-fd-dist"
  description = "The trial server's name, as in deploy/gcp/stack."
}

variable "github_subject_repository" {
  type        = string
  default     = "repo:arkanwolfshade@23161760/mc-fd-dist@1448960738"
  description = "The start of GitHub's sub claim for this repository, which names the owner and repository with their numbers."
}
