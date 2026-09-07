import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required. Create a bot with @BotFather and paste the token."),
  OWNER_CHAT_ID: z.string().trim().optional().transform((v) => (v ? v : undefined)),
  TZ_NAME: z.string().default("Asia/Karachi"),
  START_DATE: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "START_DATE must be YYYY-MM-DD").default("2026-09-14"),
  // Not "MODE": vitest sets MODE=test in the environment.
  RUN_MODE: z.enum(["polling", "webhook"]).default("polling"),
  PORT: z.coerce.number().int().positive().default(3000),
  WEBHOOK_URL: z.string().trim().optional().transform((v) => (v ? v.replace(/\/$/, "") : undefined)),
  CRON_SECRET: z.string().default("change-me"),
  LOCAL_CRON: z.enum(["true", "false"]).default("true"),
  MORNING_CRON: z.string().default("0 9 * * *"),
  EVENING_CRON: z.string().default("0 21 * * *"),
  SUNDAY_CRON: z.string().default("0 19 * * 0"),
  TABLE_NAME: z.string().default("jarvis"),
  AWS_REGION: z.string().default("us-east-1"),
  DYNAMODB_ENDPOINT: z.string().trim().optional().transform((v) => (v ? v : undefined)),
  LOG_LEVEL: z.string().default("info"),
});

export type Config = z.infer<typeof schema>;

function load(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    console.error(`Invalid configuration:\n${lines.join("\n")}\n\nCopy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  if (parsed.data.RUN_MODE === "webhook" && !parsed.data.WEBHOOK_URL) {
    console.error("RUN_MODE=webhook requires WEBHOOK_URL (e.g. https://jarvis.ammaad.online)");
    process.exit(1);
  }
  return parsed.data;
}

export const config: Config = load();
