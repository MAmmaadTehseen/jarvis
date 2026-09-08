import "dotenv/config";
import { z } from "zod";

const schema = z
  .object({
    // Discord application. App id and public key come from the Developer Portal;
    // the bot token is under the app's Bot tab.
    DISCORD_APP_ID: z.string().min(1, "DISCORD_APP_ID is required (Developer Portal > General Information)"),
    DISCORD_PUBLIC_KEY: z
      .string()
      .regex(/^[0-9a-f]{64}$/i, "DISCORD_PUBLIC_KEY must be the 64-character hex key from General Information"),
    DISCORD_BOT_TOKEN: z.string().min(1, "DISCORD_BOT_TOKEN is required (Developer Portal > Bot > Reset Token)"),

    // Where the scheduled nudges are posted, and who is allowed to run commands.
    DISCORD_CHANNEL_ID: z.string().trim().optional().transform((v) => (v ? v : undefined)),
    OWNER_USER_ID: z.string().trim().optional().transform((v) => (v ? v : undefined)),

    TZ_NAME: z.string().default("Asia/Karachi"),
    START_DATE: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "START_DATE must be YYYY-MM-DD").default("2026-09-14"),

    PORT: z.coerce.number().int().positive().default(3000),
    LOCAL_CRON: z.enum(["true", "false"]).default("false"),
    MORNING_CRON: z.string().default("0 9 * * *"),
    EVENING_CRON: z.string().default("0 21 * * *"),
    SUNDAY_CRON: z.string().default("0 19 * * 0"),

    TABLE_NAME: z.string().default("jarvis"),
    AWS_REGION: z.string().default("ap-south-1"),
    DYNAMODB_ENDPOINT: z.string().trim().optional().transform((v) => (v ? v : undefined)),
    LOG_LEVEL: z.string().default("info"),
  })
  // Cross-field rules live here rather than in load(), so a test can check an
  // environment without running the process that would exit on a bad one.
  .superRefine((v, ctx) => {
    if (v.LOCAL_CRON === "true" && !v.DISCORD_CHANNEL_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DISCORD_CHANNEL_ID"],
        message: "LOCAL_CRON=true needs DISCORD_CHANNEL_ID, or the nudges have nowhere to go",
      });
    }
  });

export const configSchema = schema;
export type Config = z.infer<typeof schema>;

function load(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    console.error(`Invalid configuration:\n${lines.join("\n")}\n\nFill these in in .env (start from .env.example), or set them in the environment.`);
    process.exit(1);
  }
  return parsed.data;
}

export const config: Config = load();
