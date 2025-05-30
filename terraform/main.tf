terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "your-terraform-state-bucket-name" # 環境に合わせて変更してください
    key            = "local-to-rtmp-pusher/terraform.tfstate"
    region         = "ap-northeast-1"
    dynamodb_table = "your-terraform-lock-table-name" # 環境に合わせて変更してください
    encrypt        = true
  }
}

provider "aws" {
  region = "ap-northeast-1"
}