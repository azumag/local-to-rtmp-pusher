# Bootstrap Variables for Terraform State Management

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "streamcaster"
  
  validation {
    condition     = can(regex("^[a-z0-9-]{1,20}$", var.project_name))
    error_message = "Project name must be 1-20 characters, lowercase letters, numbers, and hyphens only."
  }
}

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "ap-northeast-1"
  
  validation {
    condition = can(regex("^[a-z]{2}-[a-z]+-[0-9]$", var.aws_region))
    error_message = "AWS region must be in format like 'ap-northeast-1'."
  }
}

variable "create_github_oidc_role" {
  description = "Create IAM role for GitHub Actions OIDC (requires OIDC provider setup)"
  type        = bool
  default     = true
}

variable "github_repository" {
  description = "GitHub repository name (owner/repo) for OIDC trust relationship"
  type        = string
  default     = "azumag/local-to-rtmp-pusher"
  
  validation {
    condition     = can(regex("^[a-zA-Z0-9-_.]+/[a-zA-Z0-9-_.]+$", var.github_repository))
    error_message = "GitHub repository must be in format 'owner/repo'."
  }
}