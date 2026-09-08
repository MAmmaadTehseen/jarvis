import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config.js";
import { handleInteraction } from "./discord/interactions.js";
import { isValidSignature } from "./discord/verify.js";
import type { Interaction } from "./discord/types.js";
import { isJob, runJob } from "./jobs.js";
import { log } from "./logger.js";

export function createServer(): FastifyInstance {
  const app = Fastify({ logger: false });

  // The signature covers the exact bytes Discord sent, so keep the raw body.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    done(null, { raw: body as string });
  });

  app.get("/healthz", async () => ({ ok: true, ts: new Date().toISOString() }));

  app.post("/interactions", async (req, reply) => {
    const rawBody = (req.body as { raw?: string })?.raw ?? "";
    const ok = isValidSignature({
      publicKeyHex: config.DISCORD_PUBLIC_KEY,
      signature: req.headers["x-signature-ed25519"] as string | undefined,
      timestamp: req.headers["x-signature-timestamp"] as string | undefined,
      rawBody,
    });
    if (!ok) return reply.code(401).send("invalid request signature");

    let interaction: Interaction;
    try {
      interaction = JSON.parse(rawBody);
    } catch {
      return reply.code(400).send({ error: "bad json" });
    }
    return reply.send(await handleInteraction(interaction));
  });

  // Lets you fire a nudge on demand instead of waiting for 09:00.
  app.post<{ Params: { job: string } }>("/cron/:job", async (req, reply) => {
    const { job } = req.params;
    if (!isJob(job)) return reply.code(404).send({ error: `unknown job ${job}` });
    await runJob(job);
    return { ok: true, job };
  });

  app.setErrorHandler((err, _req, reply) => {
    log.error({ err }, "request failed");
    reply.code(500).send({ error: "internal" });
  });

  return app;
}
