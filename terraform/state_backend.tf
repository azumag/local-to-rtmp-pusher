resource "aws_s3_bucket" "terraform_state" {
  bucket = "your-terraform-state-bucket-name" # terraform/main.tf と同じバケット名に変更してください
  acl    = "private"

  versioning {
    enabled = true
  }

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }

  tags = {
    Name = "local-to-rtmp-pusher-terraform-state"
  }
}

resource "aws_dynamodb_table" "terraform_locks" {
  name         = "your-terraform-lock-table-name" # terraform/main.tf と同じテーブル名に変更してください
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Name = "local-to-rtmp-pusher-terraform-locks"
  }
}