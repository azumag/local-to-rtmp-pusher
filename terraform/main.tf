# StreamCaster AWS Lightsail Infrastructure
# Terraform configuration for production deployment

terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Backend configuration for state management
  # Configure this after running the bootstrap
  backend "s3" {
    bucket         = "streamcaster-terraform-state-bvusjxsj"
    key            = "streamcaster/terraform.tfstate"
    region         = "ap-northeast-1"
    encrypt        = true
    dynamodb_table = "streamcaster-terraform-locks"
  }
}

# Configure the AWS Provider
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "StreamCaster"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Owner       = var.owner
    }
  }
}

# Data sources for availability zones
data "aws_availability_zones" "available" {
  state = "available"
}

# Local values for common configurations
locals {
  instance_name = "${var.project_name}-${var.environment}"
  static_ip_name = "${var.project_name}-${var.environment}-static-ip"
  
  # Firewall rules configuration
  firewall_rules = [
    {
      port     = 22
      protocol = "tcp"
      cidrs    = var.admin_ip_ranges
    },
    {
      port     = 8080
      protocol = "tcp"
      cidrs    = var.web_access_cidrs
    },
    {
      port     = 1935
      protocol = "tcp"
      cidrs    = ["0.0.0.0/0"]  # RTMP - public access
    },
    {
      port     = 8081
      protocol = "tcp"
      cidrs    = var.monitoring_access_cidrs
    }
  ]
  
  # User data script for instance initialization (nano-optimized)
  user_data = templatefile("${path.module}/templates/user-data-nano.sh", {
    repository_url          = var.repository_url
    branch                  = var.deployment_branch
    rtmp_server            = var.rtmp_server
    stream_key             = var.stream_key
    relay_target           = var.relay_target
    log_level              = var.log_level
    environment            = var.environment
    google_drive_api_key   = var.google_drive_api_key
    google_client_id       = var.google_client_id
    google_client_secret   = var.google_client_secret
    google_refresh_token   = var.google_refresh_token
  })
}