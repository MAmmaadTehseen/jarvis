/** Minimal Discord REST client. Only the three calls Jarvis makes. */
import { config } from "../config.js";
import { log } from "../logger.js";

const BASE = "https://discord.com/api/v10";

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      authorization: `Bot ${config.DISCORD_BOT_TOKEN}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord ${method} ${path} -> ${res.status} ${text.slice(0, 400)}`);
  }
  return res.status === 204 ? undefined : res.json();
}

/** Posts a message to a channel. Used by the scheduled jobs, which have no interaction to reply to. */
export async function sendMessage(channelId: string, content: string): Promise<void> {
  // Discord rejects anything over 2000 characters outright.
  const trimmed = content.length > 2000 ? `${content.slice(0, 1990)}\n…` : content;
  await request("POST", `/channels/${channelId}/messages`, { content: trimmed });
  log.info({ channelId, length: trimmed.length }, "posted to discord");
}

/** Posts a message with a file attached. Used for the weekly scorecard image. */
export async function sendMessageWithFile(
  channelId: string,
  content: string,
  file: { name: string; data: Buffer; contentType: string },
): Promise<void> {
  const form = new FormData();
  form.append("payload_json", JSON.stringify({ content: content.slice(0, 2000), attachments: [{ id: 0, filename: file.name }] }));
  form.append("files[0]", new Blob([file.data], { type: file.contentType }), file.name);

  const res = await fetch(`${BASE}/channels/${channelId}/messages`, {
    method: "POST",
    // No content-type header: fetch sets the multipart boundary itself.
    headers: { authorization: `Bot ${config.DISCORD_BOT_TOKEN}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord upload -> ${res.status} ${text.slice(0, 400)}`);
  }
  log.info({ channelId, file: file.name, bytes: file.data.length }, "posted scorecard to discord");
}

/** Replaces the app's global slash commands with exactly this set. */
export async function putGlobalCommands(commands: unknown[]): Promise<unknown> {
  return request("PUT", `/applications/${config.DISCORD_APP_ID}/commands`, commands);
}

export async function getApplication(): Promise<{ id: string; name: string }> {
  return request("GET", "/applications/@me") as Promise<{ id: string; name: string }>;
}
