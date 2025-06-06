# This file is now handled by the bootstrap configuration
# State management resources are created separately in terraform/bootstrap/
# 
# After running the bootstrap, configure the backend in main.tf:
#
# terraform {
#   backend "s3" {
#     bucket         = "your-state-bucket-name"
#     key            = "streamcaster/terraform.tfstate"
#     region         = "ap-northeast-1"
#     encrypt        = true
#     dynamodb_table = "your-dynamodb-table-name"
#   }
# }
#
# This separation ensures that:
# 1. State resources are created once and shared across environments
# 2. Main infrastructure can be destroyed without affecting state storage
# 3. CI/CD has proper permissions through the bootstrap-created IAM resources