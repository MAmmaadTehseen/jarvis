locals {
  name = var.project_name

  # EventBridge Scheduler cron: cron(minute hour day-of-month month day-of-week year)
  schedules = {
    morning = "cron(0 9 * * ? *)"
    evening = "cron(0 21 * * ? *)"
    sunday  = "cron(0 19 ? * SUN *)"
  }
}

# Telegram echoes this back in X-Telegram-Bot-Api-Secret-Token on every update.
# The function URL is public, so this is what proves an update came from Telegram.
resource "random_password" "webhook_secret" {
  length  = 48
  special = false # Telegram allows A-Z a-z 0-9 _ - only
}

# ---------------------------------------------------------------- data store

resource "aws_dynamodb_table" "jarvis" {
  name         = local.name
  billing_mode = "PAY_PER_REQUEST" # always-free tier covers 25 GB and this volume
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }
}

# -------------------------------------------------------------- lambda role

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${local.name}-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Least privilege: this one table, and only the operations repo.ts actually uses.
data "aws_iam_policy_document" "lambda_dynamodb" {
  statement {
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
    ]
    resources = [aws_dynamodb_table.jarvis.arn]
  }
}

resource "aws_iam_role_policy" "lambda_dynamodb" {
  name   = "${local.name}-dynamodb"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_dynamodb.json
}

# ------------------------------------------------------------------- lambda

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../dist/lambda"
  output_path = "${path.module}/.build/lambda.zip"
}

# Created explicitly so retention is set. Without this Lambda creates the group
# on first invoke with "never expire", which eventually leaves the free tier.
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.name}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "jarvis" {
  function_name = local.name
  role          = aws_iam_role.lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  architectures = ["arm64"] # Graviton: cheaper per GB-second, same free tier

  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  timeout     = 30 # Telegram gives us a bit; sending several messages can take a few seconds
  memory_size = 256

  environment {
    variables = {
      NODE_ENV       = "production"
      BOT_TOKEN      = var.bot_token
      OWNER_CHAT_ID  = var.owner_chat_id
      WEBHOOK_SECRET = random_password.webhook_secret.result
      TABLE_NAME     = aws_dynamodb_table.jarvis.name
      TZ_NAME        = var.tz_name
      START_DATE     = var.start_date
      LOG_LEVEL      = "info"

      # RUN_MODE and LOCAL_CRON are deliberately absent. They configure the
      # long-running local server in src/index.ts; the Lambda handler reads
      # neither, and RUN_MODE=webhook would fail config validation here because
      # there is no WEBHOOK_URL to give it (the function URL is created after
      # the function, so it cannot be one of the function's own env vars).
      # AWS_REGION is set by the Lambda runtime itself.
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_logs,
    aws_cloudwatch_log_group.lambda,
  ]
}

resource "aws_lambda_function_url" "jarvis" {
  function_name      = aws_lambda_function.jarvis.function_name
  authorization_type = "NONE" # Telegram cannot sign requests with SigV4
}

# AuthType NONE still needs an explicit resource policy when created via the API.
resource "aws_lambda_permission" "function_url" {
  statement_id           = "AllowPublicFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.jarvis.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

# ---------------------------------------------------------------- schedules

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${local.name}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "scheduler_invoke" {
  statement {
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.jarvis.arn]
  }
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  name   = "${local.name}-invoke"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler_invoke.json
}

resource "aws_scheduler_schedule" "job" {
  for_each = local.schedules

  name       = "${local.name}-${each.key}"
  group_name = "default"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = each.value
  schedule_expression_timezone = var.tz_name

  target {
    arn      = aws_lambda_function.jarvis.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ job = each.key })

    retry_policy {
      maximum_retry_attempts = 2
    }
  }
}
