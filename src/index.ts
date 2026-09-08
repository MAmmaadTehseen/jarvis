/**
 * Local development server. Production runs src/lambda.ts instead.
 *
 * Discord delivers interactions over HTTPS, so to drive this from Discord you
 * need a tunnel (`cloudflared tunnel --url http://localhost:3000`) and its
 * public URL set as the app's Interactions Endpoint URL. Without a tunnel this
 * is still useful: POST /cron/morning fires a nudge, and the tests cover the rest.
 */
import cron from "node-cron";
import { config } from "./config.js";
import { ensureTable } from "./db/client.js";
import * as repo from "./db/repo.js";
import { GOAL_SEEDS } from "./domain/rotation.js";
import { runJob, type JobName } from "./jobs.js";
import { log } from "./logger.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  await ensureTable();
  await repo.ensureGoals(GOAL_SEEDS);

  const app = createServer();
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  log.info({ port: config.PORT }, "http listening");

  if (config.LOCAL_CRON === "true") {
    const schedule: Array<[JobName, string]> = [
      ["morning", config.MORNING_CRON],
      ["evening", config.EVENING_CRON],
      ["sunday", config.SUNDAY_CRON],
    ];
    for (const [job, expr] of schedule) {
      if (!cron.validate(expr)) throw new Error(`Invalid cron expression for ${job}: ${expr}`);
      cron.schedule(expr, () => void runJob(job).catch((err) => log.error({ err, job }, "job failed")), {
        timezone: config.TZ_NAME,
      });
    }
    log.info({ tz: config.TZ_NAME }, "local cron enabled");
  }

  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down");
    await app.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  log.error({ err }, "fatal");
  process.exit(1);
});
