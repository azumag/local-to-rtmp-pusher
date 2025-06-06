# Terraform State Management Bootstrap
# This creates the S3 bucket and DynamoDB table for remote state storage
# Run this ONCE before using the main Terraform configuration

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  
  # No backend configuration - this will use local state
  # to create the remote state resources
}

# Configure the AWS Provider
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "StreamCaster-State"
      Purpose     = "Terraform State Management"
      ManagedBy   = "Terraform-Bootstrap"
      Environment = "shared"
    }
  }
}

# Random suffix for unique bucket names
resource "random_string" "bucket_suffix" {
  length  = 8
  special = false
  upper   = false
}

# S3 Bucket for Terraform State Storage
resource "aws_s3_bucket" "terraform_state" {
  bucket        = "${var.project_name}-terraform-state-${random_string.bucket_suffix.result}"
  force_destroy = false

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name        = "${var.project_name}-terraform-state"
    Purpose     = "Terraform state storage"
    Environment = "shared"
  }
}

# Enable versioning for the S3 bucket
resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Enable server-side encryption for the S3 bucket
resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Block public access to the S3 bucket
resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# S3 bucket lifecycle configuration
resource "aws_s3_bucket_lifecycle_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    id     = "terraform_state_lifecycle"
    status = "Enabled"

    # Keep multiple versions but limit them
    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    # Move old versions to cheaper storage
    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }

    noncurrent_version_transition {
      noncurrent_days = 60
      storage_class   = "GLACIER"
    }
  }
}

# DynamoDB table for state locking
resource "aws_dynamodb_table" "terraform_locks" {
  name           = "${var.project_name}-terraform-locks"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  # Enable point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  # Server-side encryption
  server_side_encryption {
    enabled = true
  }

  tags = {
    Name        = "${var.project_name}-terraform-locks"
    Purpose     = "Terraform state locking"
    Environment = "shared"
  }
}

# IAM policy for Terraform state access
data "aws_iam_policy_document" "terraform_state_policy" {
  # S3 bucket permissions
  statement {
    sid    = "ListBucket"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetBucketVersioning",
      "s3:GetBucketLocation"
    ]
    resources = [aws_s3_bucket.terraform_state.arn]
  }

  statement {
    sid    = "GetAndPutObjects"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:GetObjectVersion"
    ]
    resources = ["${aws_s3_bucket.terraform_state.arn}/*"]
  }

  # DynamoDB permissions for locking
  statement {
    sid    = "DynamoDBLocking"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
      "dynamodb:DescribeTable"
    ]
    resources = [aws_dynamodb_table.terraform_locks.arn]
  }
}

# Create IAM policy
resource "aws_iam_policy" "terraform_state_policy" {
  name        = "${var.project_name}-terraform-state-policy"
  description = "IAM policy for Terraform state management"
  policy      = data.aws_iam_policy_document.terraform_state_policy.json

  tags = {
    Name        = "${var.project_name}-terraform-state-policy"
    Purpose     = "Terraform state management permissions"
    Environment = "shared"
  }
}

# IAM role for GitHub Actions (optional, for OIDC)
resource "aws_iam_role" "github_actions" {
  count = var.create_github_oidc_role ? 1 : 0
  name  = "${var.project_name}-github-actions-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:*"
          }
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-github-actions-role"
    Purpose     = "GitHub Actions OIDC role"
    Environment = "shared"
  }
}

# Attach policies to GitHub Actions role
resource "aws_iam_role_policy_attachment" "github_actions_state" {
  count      = var.create_github_oidc_role ? 1 : 0
  policy_arn = aws_iam_policy.terraform_state_policy.arn
  role       = aws_iam_role.github_actions[0].name
}

# Additional policy for Lightsail operations
data "aws_iam_policy_document" "lightsail_policy" {
  statement {
    sid    = "LightsailFullAccess"
    effect = "Allow"
    actions = [
      "lightsail:*"
    ]
    resources = ["*"]
  }

  # EC2 permissions needed for some Lightsail operations
  statement {
    sid    = "EC2ForLightsail"
    effect = "Allow"
    actions = [
      "ec2:DescribeAvailabilityZones",
      "ec2:DescribeRegions"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "lightsail_policy" {
  name        = "${var.project_name}-lightsail-policy"
  description = "IAM policy for Lightsail operations"
  policy      = data.aws_iam_policy_document.lightsail_policy.json

  tags = {
    Name        = "${var.project_name}-lightsail-policy"
    Purpose     = "Lightsail operations permissions"
    Environment = "shared"
  }
}

resource "aws_iam_role_policy_attachment" "github_actions_lightsail" {
  count      = var.create_github_oidc_role ? 1 : 0
  policy_arn = aws_iam_policy.lightsail_policy.arn
  role       = aws_iam_role.github_actions[0].name
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}