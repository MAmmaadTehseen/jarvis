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

variable "discord_app_id" {
  description = "Discord application id (Developer Portal > General Information)."
  type        = string
}

variable "discord_public_key" {
  description = "Discord public key, 64 hex characters. Used to verify interaction signatures."
  type        = string
}

variable "discord_bot_token" {
  description = "Discord bot token (Developer Portal > Bot > Reset Token)."
  type        = string
  sensitive   = true
}

variable "discord_channel_id" {
  description = "Channel the scheduled nudges are posted to."
  type        = string
}

variable "owner_user_id" {
  description = "Your Discord user id. Everyone else's commands are ignored."
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
