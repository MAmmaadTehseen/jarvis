# GitHub Actions deploys by exchanging its own signed job token for temporary
# AWS credentials. No access keys are stored in the repository, and nothing here
# outlives the ~1 hour session it is issued for.

variable "github_owner" {
  description = "GitHub account that owns the repository."
  type        = string
  default     = "MAmmaadTehseen"
}

variable "github_owner_id" {
  description = "Numeric account id: gh api user --jq .id"
  type        = string
  default     = "97141225"
}

variable "github_repo_name" {
  description = "Repository name, without the owner."
  type        = string
  default     = "jarvis"
}

variable "github_repo_id" {
  description = "Numeric repository id: gh api repos/OWNER/REPO --jq .id"
  type        = string
  default     = "1360305333"
}

variable "github_branch" {
  description = "The only branch whose workflow runs may deploy."
  type        = string
  default     = "main"
}

locals {
  # GitHub now issues immutable subject claims, embedding the numeric account
  # and repository ids: repo:owner@123/name@456:ref:refs/heads/main. The point is
  # that renaming an account or repo no longer silently hands its trust to
  # whoever claims the freed-up name.
  #
  # Both forms are accepted because the rollout is per-account and can flip
  # underneath us. Neither contains a wildcard, so each one still pins to
  # exactly this repository and branch - a StringLike with `@*` would have been
  # the lazy fix and would have widened what the role trusts.
  github_subject_immutable = "repo:${var.github_owner}@${var.github_owner_id}/${var.github_repo_name}@${var.github_repo_id}:ref:refs/heads/${var.github_branch}"
  github_subject_legacy    = "repo:${var.github_owner}/${var.github_repo_name}:ref:refs/heads/${var.github_branch}"
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  # thumbprint_list is deliberately omitted. AWS resolves and pins the
  # certificate for this well-known provider itself; a hard-coded thumbprint is
  # a scheduled outage for whenever GitHub rotates its intermediate CA.
}

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # The load-bearing line. Without a `sub` condition this role trusts the
    # GitHub OIDC issuer as a whole, meaning any workflow in any repository on
    # GitHub could assume it. Pinned to one repo and one branch, so a pull
    # request from a fork cannot deploy.
    #
    # A list here is OR: either exact subject is accepted, neither is a pattern.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [local.github_subject_immutable, local.github_subject_legacy]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name                 = "${local.name}-github-deploy"
  description          = "Assumed by GitHub Actions via OIDC to ship new function code."
  assume_role_policy   = data.aws_iam_policy_document.github_assume.json
  max_session_duration = 3600
}

# Ship code and smoke-test it. Not create, not delete, not reconfigure: the
# shape of the infrastructure stays with Terraform on a human's machine.
data "aws_iam_policy_document" "github_deploy" {
  statement {
    actions = [
      "lambda:UpdateFunctionCode",
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:InvokeFunction",
    ]
    resources = [aws_lambda_function.jarvis.arn]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "${local.name}-deploy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}
