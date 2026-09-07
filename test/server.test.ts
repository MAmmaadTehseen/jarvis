import { describe, expect, it } from "vitest";

process.env.BOT_TOKEN ??= "123:test-token";
process.env.CRON_SECRET = "s3cret";

const { Bot } = await import("grammy");
const { createServer } = await import("../src/server.js");

describe("http server", () => {
  const app = createServer(new Bot(process.env.BOT_TOKEN!));

  it("answers /healthz", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, mode: "polling" });
  });

  it("rejects cron calls without the shared secret", async () => {
    const res = await app.inject({ method: "POST", url: "/cron/morning" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects unknown jobs", async () => {
    const res = await app.inject({ method: "POST", url: "/cron/lunch", headers: { "x-cron-secret": "s3cret" } });
    expect(res.statusCode).toBe(404);
  });

  it("has no webhook route in polling mode", async () => {
    const res = await app.inject({ method: "POST", url: "/webhook", payload: {} });
    expect(res.statusCode).toBe(404);
  });
});
