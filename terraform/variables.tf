# StreamCaster Terraform Variables

# === GENERAL CONFIGURATION ===
variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "streamcaster"
  
  validation {
    condition     = can(regex("^[a-z0-9-]{1,20}$", var.project_name))
    error_message = "Project name must be 1-20 characters, lowercase letters, numbers, and hyphens only."
  }
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "owner" {
  description = "Resource owner/team for tagging"
  type        = string
  default     = "StreamCaster-Team"
}

# === AWS CONFIGURATION ===
variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "ap-northeast-1"
  
  validation {
    condition = can(regex("^[a-z]{2}-[a-z]+-[0-9]$", var.aws_region))
    error_message = "AWS region must be in format like 'ap-northeast-1'."
  }
}

variable "availability_zone" {
  description = "Lightsail availability zone (will use first available if not specified)"
  type        = string
  default     = ""
}

# === LIGHTSAIL INSTANCE CONFIGURATION ===
variable "instance_bundle_id" {
  description = "Lightsail bundle ID for instance size"
  type        = string
  default     = "nano_2_0"  # $5/month: 1 vCPU, 1GB RAM, 40GB SSD
  
  validation {
    condition = contains([
      "nano_2_0",     # $5/month
      "micro_2_0",    # $10/month
      "small_2_0",    # $20/month
      "medium_2_0",   # $40/month
      "large_2_0"     # $80/month
    ], var.instance_bundle_id)
    error_message = "Bundle ID must be a valid Lightsail bundle."
  }
}

variable "instance_blueprint_id" {
  description = "Lightsail blueprint ID for OS"
  type        = string
  default     = "ubuntu_22_04"
  
  validation {
    condition = contains([
      "ubuntu_22_04",
      "ubuntu_24_04",
      "amazon_linux_2"
    ], var.instance_blueprint_id)
    error_message = "Blueprint ID must be a supported OS."
  }
}

# === NETWORK SECURITY ===
variable "admin_ip_ranges" {
  description = "CIDR blocks for SSH access (admin IPs)"
  type        = list(string)
  default     = ["0.0.0.0/0"]  # Change this in production!
  
  validation {
    condition = alltrue([
      for cidr in var.admin_ip_ranges : can(cidrhost(cidr, 0))
    ])
    error_message = "All admin IP ranges must be valid CIDR blocks."
  }
}

variable "web_access_cidrs" {
  description = "CIDR blocks for Web UI access (port 8080)"
  type        = list(string)
  default     = ["0.0.0.0/0"]  # Consider restricting in production
}

variable "monitoring_access_cidrs" {
  description = "CIDR blocks for monitoring access (port 8081)"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# === SSH CONFIGURATION ===
variable "ssh_public_key_path" {
  description = "Path to SSH public key file (leave empty to skip key pair creation)"
  type        = string
  default     = ""
  
  validation {
    condition = var.ssh_public_key_path == "" || can(fileexists(var.ssh_public_key_path))
    error_message = "SSH public key file must exist if path is provided."
  }
}

# === APPLICATION CONFIGURATION ===
variable "repository_url" {
  description = "Git repository URL for application code"
  type        = string
  default     = "https://github.com/azumag/local-to-rtmp-pusher.git"
  
  validation {
    condition     = can(regex("^https://github\\.com/.+\\.git$", var.repository_url))
    error_message = "Repository URL must be a valid GitHub HTTPS URL."
  }
}

variable "deployment_branch" {
  description = "Git branch to deploy"
  type        = string
  default     = "development"
}

variable "rtmp_server" {
  description = "RTMP server URL for streaming"
  type        = string
  default     = "rtmp://live.twitch.tv/live"
  
  validation {
    condition     = can(regex("^rtmp://", var.rtmp_server))
    error_message = "RTMP server must be a valid RTMP URL."
  }
}

variable "stream_key" {
  description = "Stream key for RTMP server (use environment variable)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "relay_target" {
  description = "RTMP relay target URL for forwarding streams"
  type        = string
  default     = ""
  
  validation {
    condition = var.relay_target == "" || can(regex("^rtmp://", var.relay_target))
    error_message = "Relay target must be empty or a valid RTMP URL."
  }
}

variable "log_level" {
  description = "Application log level"
  type        = string
  default     = "info"
  
  validation {
    condition     = contains(["debug", "info", "warn", "error"], var.log_level)
    error_message = "Log level must be one of: debug, info, warn, error."
  }
}

# === GOOGLE DRIVE INTEGRATION ===
variable "google_drive_api_key" {
  description = "Google Drive API key for public folder access"
  type        = string
  sensitive   = true
  default     = ""
}

variable "google_client_id" {
  description = "Google OAuth client ID"
  type        = string
  sensitive   = true
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "google_refresh_token" {
  description = "Google OAuth refresh token"
  type        = string
  sensitive   = true
  default     = ""
}

# === RESOURCE LIMITS ===
variable "enable_monitoring" {
  description = "Enable CloudWatch monitoring"
  type        = bool
  default     = true
}

variable "backup_retention_days" {
  description = "Number of days to retain instance snapshots"
  type        = number
  default     = 7
  
  validation {
    condition     = var.backup_retention_days >= 1 && var.backup_retention_days <= 365
    error_message = "Backup retention days must be between 1 and 365."
  }
}

# === FEATURE FLAGS ===
variable "enable_automatic_snapshots" {
  description = "Enable automatic daily snapshots"
  type        = bool
  default     = true
}

variable "enable_static_ip" {
  description = "Enable static IP allocation"
  type        = bool
  default     = true
}

variable "enable_monitoring_alerts" {
  description = "Enable CloudWatch monitoring alerts"
  type        = bool
  default     = false  # Disabled by default as it incurs additional costs
}