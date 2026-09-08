/**
 * AWS Lambda entry point. One function serves two kinds of event:
 *
 *   - EventBridge Scheduler sends {"job":"morning"|"evening"|"sunday"}
 *   - The function URL receives Discord interactions over HTTPS
 *
 * Discord requires a reply within 3 seconds and rejects any endpoint that does
 * not return 401 for a bad signature, so verification happens before parsing.
 */
import type { Context } from "aws-lambda";
import { config } from "./config.js";
import * as repo from "./db/repo.js";
import { handleInteraction } from "./discord/interactions.js";
import { isValidSignature } from "./discord/verify.js";
import type { Interaction } from "./discord/types.js";
import { GOAL_SEEDS } from "./domain/rotation.js";
import { isJob, runJob } from "./jobs.js";
import { log } from "./logger.js";

/** Seed goals once per container, not once per request. */
let bootstrapped: Promise<void> | undefined;
function bootstrap(): Promise<void> {
  bootstrapped ??= repo.ensureGoals(GOAL_SEEDS);
  return bootstrapped;
}

interface FunctionUrlEvent {
  body?: string;
  isBase64Encoded?: boolean;
  headers?: Record<string, string | undefined>;
}

interface ScheduledEvent {
  job?: string;
}

function json(statusCode: number, body: unknown) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export async function handler(event: ScheduledEvent & FunctionUrlEvent, _context: Context): Promise<unknown> {
  if (typeof event.job === "string") {
    await bootstrap();
    if (!isJob(event.job)) {
      log.error({ job: event.job }, "unknown scheduled job");
      return { ok: false, error: `unknown job ${event.job}` };
    }
    await runJob(event.job);
    return { ok: true, job: event.job };
  }

  const rawBody = event.isBase64Encoded && event.body ? Buffer.from(event.body, "base64").toString("utf8") : (event.body ?? "");
  const headers = event.headers ?? {};

  // Header names arrive lower-cased through a function URL, but not everywhere.
  const signature = headers["x-signature-ed25519"] ?? headers["X-Signature-Ed25519"];
  const timestamp = headers["x-signature-timestamp"] ?? headers["X-Signature-Timestamp"];

  if (!isValidSignature({ publicKeyHex: config.DISCORD_PUBLIC_KEY, signature, timestamp, rawBody })) {
    // Discord deliberately sends bad signatures when validating the endpoint.
    return { statusCode: 401, body: "invalid request signature" };
  }

  let interaction: Interaction;
  try {
    interaction = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "bad json" });
  }

  // A PING needs no table, and answering it fast keeps endpoint validation snappy.
  if (interaction.type !== 1) await bootstrap();

  return json(200, await handleInteraction(interaction));
}
