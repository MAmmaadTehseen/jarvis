/**
 * Ties the Terraform environment block to the config schema.
 *
 * These drift apart silently: Terraform once set RUN_MODE=webhook without a
 * WEBHOOK_URL, which passes review, deploys fine, and then makes every cold
 * start exit(1). Nothing else in the suite would have caught it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

process.env.BOT_TOKEN ??= "test-token";

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
  BOT_TOKEN: "8123456789:AAtest",
  OWNER_CHAT_ID: "123456789",
  WEBHOOK_SECRET: "a".repeat(48),
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
    expect(names).toContain("BOT_TOKEN");
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

  it("rejects RUN_MODE=webhook without a URL, which is why it is not in the block", () => {
    expect(names).not.toContain("RUN_MODE");

    const bad = configSchema.safeParse({ BOT_TOKEN: "x", RUN_MODE: "webhook" });
    expect(bad.success).toBe(false);
  });
});
