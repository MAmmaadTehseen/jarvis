import Fastify, { type FastifyInstance } from "fastify";
import { webhookCallback, type Bot } from "grammy";
import { config } from "./config.js";
import { isJob, runJob } from "./jobs.js";
import { log } from "./logger.js";

export function createServer(bot: Bot): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/healthz", async () => ({ ok: true, mode: config.RUN_MODE, ts: new Date().toISOString() }));

  // EventBridge Scheduler (or curl) triggers jobs here.
  app.post<{ Params: { job: string } }>("/cron/:job", async (req, reply) => {
    if (req.headers["x-cron-secret"] !== config.CRON_SECRET) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const { job } = req.params;
    if (!isJob(job)) return reply.code(404).send({ error: `unknown job ${job}` });
    await runJob(job, bot);
    return { ok: true, job };
  });

  if (config.RUN_MODE === "webhook") {
    app.post("/webhook", webhookCallback(bot, "fastify"));
  }

  app.setErrorHandler((err, _req, reply) => {
    log.error({ err }, "request failed");
    reply.code(500).send({ error: "internal" });
  });

  return app;
}
