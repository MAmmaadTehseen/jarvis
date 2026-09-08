import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const der = publicKey.export({ format: "der", type: "spki" }) as Buffer;

// Assigned, not defaulted, so a stale .env cannot change what is under test.
process.env.DISCORD_APP_ID = "123456789";
process.env.DISCORD_PUBLIC_KEY = der.subarray(der.length - 32).toString("hex");
process.env.DISCORD_BOT_TOKEN = "test-bot-token";
process.env.LOCAL_CRON = "false";

const { createServer } = await import("../src/server.js");

function signed(body: unknown) {
  const raw = JSON.stringify(body);
  const timestamp = "1757260800";
  return {
    payload: raw,
    headers: {
      "content-type": "application/json",
      "x-signature-timestamp": timestamp,
      "x-signature-ed25519": sign(null, Buffer.from(timestamp + raw, "utf8"), privateKey).toString("hex"),
    },
  };
}

describe("http server", () => {
  const app = createServer();

  it("answers /healthz", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });

  it("answers a signed PING with a PONG", async () => {
    const { payload, headers } = signed({ type: 1 });
    const res = await app.inject({ method: "POST", url: "/interactions", payload, headers });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ type: 1 });
  });

  it("rejects an unsigned interaction with 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/interactions",
      payload: JSON.stringify({ type: 1 }),
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a body that does not match its signature", async () => {
    const { headers } = signed({ type: 1 });
    const res = await app.inject({ method: "POST", url: "/interactions", payload: JSON.stringify({ type: 2 }), headers });
    expect(res.statusCode).toBe(401);
  });

  it("rejects unknown cron jobs", async () => {
    const res = await app.inject({ method: "POST", url: "/cron/lunch" });
    expect(res.statusCode).toBe(404);
  });
});
