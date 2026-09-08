variable "aws_region" {
  description = "Region to deploy into. Mumbai is closest to Karachi. Free-tier limits are per-account, not per-region."
  type        = string
  default     = "ap-south-1"
}

variable "project_name" {
  description = "Prefix for every resource name."
  type        = string
  default     = "jarvis"
}

variable "bot_token" {
  description = "Telegram bot token from @BotFather."
  type        = string
  sensitive   = true
}

variable "owner_chat_id" {
  description = "Your Telegram chat id. The bot ignores everyone else and sends nudges here."
  type        = string
}

variable "tz_name" {
  description = "IANA timezone for the schedules and for what counts as 'today'."
  type        = string
  default     = "Asia/Karachi"
}

variable "start_date" {
  description = "Monday of week 1, YYYY-MM-DD."
  type        = string
  default     = "2026-09-14"
}

variable "log_retention_days" {
  description = "CloudWatch log retention. Free tier covers 5 GB/month ingest; short retention keeps storage free too."
  type        = number
  default     = 14
}
