output "interactions_url" {
  description = "Paste this into the Discord Developer Portal as the Interactions Endpoint URL."
  value       = aws_lambda_function_url.jarvis.function_url
}

output "table_name" {
  value = aws_dynamodb_table.jarvis.name
}

output "log_group" {
  description = "aws logs tail <this> --follow"
  value       = aws_cloudwatch_log_group.lambda.name
}

output "github_deploy_role_arn" {
  description = "Set as the AWS_DEPLOY_ROLE_ARN secret on the GitHub repo."
  value       = aws_iam_role.github_deploy.arn
}
