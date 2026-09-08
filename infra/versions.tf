terraform {
  required_version = ">= 1.6"

  required_providers {
    aws     = { source = "hashicorp/aws", version = ">= 5.40" }
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
  }

  # State lives on this machine for now. It holds the Discord bot token in plain
  # text, which is why infra/.gitignore excludes it.
  # Week 3-4 moves this to an encrypted S3 backend.
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project_name
      ManagedBy = "terraform"
    }
  }
}
