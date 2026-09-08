/**
 * AWS Lambda entry point. One function serves two kinds of event:
 *
 *   - EventBridge Scheduler sends {"job":"morning"|"evening"|"sunday"}
 *   - The Function URL sends a Telegram update as an HTTP request
 *
 * Local development uses src/index.ts instead (long-running server + polling).
 */
import type { Context } from "aws-lambda";
import { webhookCallback } from "grammy";
import { createBot } from "./bot.js";
import { config } from "./config.js";
import * as repo from "./db/repo.js";
import { GOAL_SEEDS } from "./domain/rotation.js";
import { isJob, runJob } from "./jobs.js";
import { log } from "./logger.js";

const bot = createBot();

/** Seed goals once per container, not once per request. */
let bootstrapped: Promise<void> | undefined;
function bootstrap(): Promise<void> {
  bootstrapped ??= repo.ensureGoals(GOAL_SEEDS);
  return bootstrapped;
}

if (!config.WEBHOOK_SECRET) {
  // The Function URL is reachable by anyone. Without this, anyone could POST
  // a fake Telegram update and drive the bot.
  throw new Error("WEBHOOK_SECRET is required in Lambda");
}

const handleWebhook = webhookCallback(bot, "aws-lambda-async", {
  secretToken: config.WEBHOOK_SECRET,
});

interface ScheduledEvent {
  job?: string;
}

export async function handler(event: ScheduledEvent & Record<string, unknown>, context: Context): Promise<unknown> {
  await bootstrap();

  if (typeof event.job === "string") {
    if (!isJob(event.job)) {
      log.error({ job: event.job }, "unknown scheduled job");
      return { ok: false, error: `unknown job ${event.job}` };
    }
    await runJob(event.job, bot);
    return { ok: true, job: event.job };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- grammy's adapter types the event loosely
  return handleWebhook(event as any, context);
}
