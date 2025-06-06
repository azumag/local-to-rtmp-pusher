# Bootstrap Outputs for State Management

# S3 Bucket Information
output "state_bucket_name" {
  description = "Name of the S3 bucket for Terraform state"
  value       = aws_s3_bucket.terraform_state.bucket
}

output "state_bucket_arn" {
  description = "ARN of the S3 bucket for Terraform state"
  value       = aws_s3_bucket.terraform_state.arn
}

output "state_bucket_region" {
  description = "Region of the S3 bucket for Terraform state"
  value       = aws_s3_bucket.terraform_state.region
}

# DynamoDB Table Information
output "dynamodb_table_name" {
  description = "Name of the DynamoDB table for state locking"
  value       = aws_dynamodb_table.terraform_locks.name
}

output "dynamodb_table_arn" {
  description = "ARN of the DynamoDB table for state locking"
  value       = aws_dynamodb_table.terraform_locks.arn
}

# IAM Information
output "terraform_state_policy_arn" {
  description = "ARN of the IAM policy for Terraform state management"
  value       = aws_iam_policy.terraform_state_policy.arn
}

output "lightsail_policy_arn" {
  description = "ARN of the IAM policy for Lightsail operations"
  value       = aws_iam_policy.lightsail_policy.arn
}

output "github_actions_role_arn" {
  description = "ARN of the GitHub Actions IAM role (if created)"
  value       = var.create_github_oidc_role ? aws_iam_role.github_actions[0].arn : null
}

output "github_actions_role_name" {
  description = "Name of the GitHub Actions IAM role (if created)"
  value       = var.create_github_oidc_role ? aws_iam_role.github_actions[0].name : null
}

# Backend Configuration for Main Terraform
output "backend_config" {
  description = "Backend configuration for main Terraform configuration"
  value = {
    bucket         = aws_s3_bucket.terraform_state.bucket
    key            = "streamcaster/terraform.tfstate"
    region         = aws_s3_bucket.terraform_state.region
    encrypt        = true
    dynamodb_table = aws_dynamodb_table.terraform_locks.name
  }
}

# Complete backend configuration block
output "backend_config_block" {
  description = "Complete backend configuration block to copy to main.tf"
  value = <<-EOT
    backend "s3" {
      bucket         = "${aws_s3_bucket.terraform_state.bucket}"
      key            = "streamcaster/terraform.tfstate"
      region         = "${aws_s3_bucket.terraform_state.region}"
      encrypt        = true
      dynamodb_table = "${aws_dynamodb_table.terraform_locks.name}"
    }
  EOT
}

# GitHub Actions Environment Variables
output "github_actions_env_vars" {
  description = "Environment variables to set in GitHub Actions"
  value = {
    AWS_REGION                = data.aws_region.current.name
    TF_STATE_BUCKET          = aws_s3_bucket.terraform_state.bucket
    TF_STATE_DYNAMODB_TABLE  = aws_dynamodb_table.terraform_locks.name
    TF_STATE_KEY             = "streamcaster/terraform.tfstate"
  }
}

# Cost Information
output "estimated_monthly_cost" {
  description = "Estimated monthly cost for state management resources"
  value = {
    s3_bucket_storage    = "~$0.023/GB (Standard storage)"
    s3_requests         = "~$0.0004/1000 PUT requests"
    dynamodb_table      = "Pay-per-request (~$0.0000125/request)"
    total_estimated     = "~$1-3/month (depending on usage)"
  }
}

# Setup Instructions
output "setup_instructions" {
  description = "Instructions for setting up the main Terraform configuration"
  value = <<-EOT
    
    ## Next Steps:
    
    1. Copy the backend configuration to your main Terraform configuration:
       
       terraform {
         backend "s3" {
           bucket         = "${aws_s3_bucket.terraform_state.bucket}"
           key            = "streamcaster/terraform.tfstate"
           region         = "${aws_s3_bucket.terraform_state.region}"
           encrypt        = true
           dynamodb_table = "${aws_dynamodb_table.terraform_locks.name}"
         }
       }
    
    2. Initialize your main Terraform configuration:
       cd ../
       terraform init
    
    3. Plan and apply your main configuration:
       terraform plan
       terraform apply
    
    4. For GitHub Actions, set these repository secrets:
       - AWS_ACCESS_KEY_ID
       - AWS_SECRET_ACCESS_KEY
       
       Or use the OIDC role ARN: ${var.create_github_oidc_role ? aws_iam_role.github_actions[0].arn : "Not created"}
  EOT
}