import cron from "node-cron";
import { config } from "./config.js";
import { log } from "./logger.js";
import { ensureTable } from "./db/client.js";
import * as repo from "./db/repo.js";
import { GOAL_SEEDS } from "./domain/rotation.js";
import { createBot, COMMANDS } from "./bot.js";
import { createServer } from "./server.js";
import { runJob, type JobName } from "./jobs.js";

async function main(): Promise<void> {
  await ensureTable();
  await repo.ensureGoals(GOAL_SEEDS);

  const bot = createBot();
  await bot.api.setMyCommands(COMMANDS);

  const app = createServer(bot);
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
      cron.schedule(expr, () => void runJob(job, bot).catch((err) => log.error({ err, job }, "job failed")), {
        timezone: config.TZ_NAME,
      });
    }
    log.info({ tz: config.TZ_NAME, schedule: Object.fromEntries(schedule) }, "local cron enabled");
  }

  if (config.RUN_MODE === "webhook") {
    await bot.api.setWebhook(`${config.WEBHOOK_URL}/webhook`, {
      drop_pending_updates: false,
      secret_token: config.WEBHOOK_SECRET,
    });
    log.info({ url: `${config.WEBHOOK_URL}/webhook` }, "webhook registered");
  } else {
    await bot.api.deleteWebhook();
    void bot.start({ onStart: (me) => log.info({ username: me.username }, "polling as @" + me.username) });
  }

  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down");
    if (config.RUN_MODE === "polling") await bot.stop();
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
