# GitHub Actions deploys by exchanging its own signed job token for temporary
# AWS credentials. No access keys are stored in the repository, and nothing here
# outlives the ~1 hour session it is issued for.

variable "github_repo" {
  description = "owner/name of the only repository allowed to deploy."
  type        = string
  default     = "MAmmaadTehseen/jarvis"
}

variable "github_branch" {
  description = "The only branch whose workflow runs may deploy."
  type        = string
  default     = "main"
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
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:ref:refs/heads/${var.github_branch}"]
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
