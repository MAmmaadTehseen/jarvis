output "function_url" {
  description = "Public HTTPS endpoint. This is what Telegram posts updates to."
  value       = aws_lambda_function_url.jarvis.function_url
}

output "webhook_secret" {
  description = "Shared secret Telegram must send back. Used by npm run set-webhook."
  value       = random_password.webhook_secret.result
  sensitive   = true
}

output "table_name" {
  value = aws_dynamodb_table.jarvis.name
}

output "log_group" {
  description = "aws logs tail <this> --follow"
  value       = aws_cloudwatch_log_group.lambda.name
}
