/**
 * Ties the Terraform environment block to the config schema.
 *
 * These drift apart silently: Terraform once set RUN_MODE=webhook without the
 * URL it required, which passes review, deploys fine, and then makes every cold
 * start exit(1). Nothing else in the suite would have caught it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Assigned, not defaulted: dotenv will not override these, so a stale .env on
// the developer's machine cannot decide whether this suite passes.
process.env.DISCORD_APP_ID = "1";
process.env.DISCORD_PUBLIC_KEY = "ab".repeat(32);
process.env.DISCORD_BOT_TOKEN = "t";
process.env.LOCAL_CRON = "false";

const { configSchema } = await import("../src/config.js");

/** Names inside the Lambda's `environment { variables = { ... } }` block. */
function terraformEnvNames(): string[] {
  const tf = readFileSync(new URL("../infra/main.tf", import.meta.url), "utf8");
  const block = tf.match(/environment\s*\{\s*variables\s*=\s*\{([\s\S]*?)\n {4}\}/);
  if (!block?.[1]) throw new Error("could not find the environment block in infra/main.tf");
  return [...block[1].matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]!);
}

/** A plausible value per variable, so we test the shape rather than the values. */
const SAMPLES: Record<string, string> = {
  NODE_ENV: "production",
  DISCORD_APP_ID: "1234567890123456789",
  DISCORD_PUBLIC_KEY: "ab".repeat(32),
  DISCORD_BOT_TOKEN: "a-bot-token",
  DISCORD_CHANNEL_ID: "1234567890123456789",
  OWNER_USER_ID: "1234567890123456789",
  TABLE_NAME: "jarvis",
  TZ_NAME: "Asia/Karachi",
  START_DATE: "2026-09-14",
  LOG_LEVEL: "info",
};

describe("the Lambda environment", () => {
  const names = terraformEnvNames();

  it("was actually parsed out of main.tf", () => {
    // Without this, a broken regex yields an empty list and every other
    // assertion in this file passes for the wrong reason.
    expect(names).toContain("DISCORD_BOT_TOKEN");
    expect(names).toContain("TABLE_NAME");
    expect(names.length).toBeGreaterThanOrEqual(6);
  });

  it("sets every variable the test knows how to fill", () => {
    // A new Terraform variable has to be added to SAMPLES, otherwise the schema
    // check below would pass by simply omitting it.
    expect(names.filter((n) => !(n in SAMPLES))).toEqual([]);
  });

  it("satisfies the config schema on its own", () => {
    const env: Record<string, string> = { AWS_REGION: "ap-south-1" }; // set by the Lambda runtime
    for (const name of names) env[name] = SAMPLES[name]!;

    const result = configSchema.safeParse(env);
    const issues = result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    expect(issues).toEqual([]);
  });

  it("leaves DYNAMODB_ENDPOINT unset, so the SDK talks to real DynamoDB", () => {
    expect(names).not.toContain("DYNAMODB_ENDPOINT");
  });

  it("leaves LOCAL_CRON off, because EventBridge invokes the function directly", () => {
    expect(names).not.toContain("LOCAL_CRON");
  });

  it("still rejects an environment that is missing the Discord credentials", () => {
    const bad = configSchema.safeParse({ TABLE_NAME: "jarvis" });
    expect(bad.success).toBe(false);
  });
});
