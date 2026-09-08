/**
 * Points Telegram at the deployed Lambda and publishes the command menu.
 * Run after `terraform apply`:  npm run set-webhook
 */
import { execFileSync } from "node:child_process";
import { Bot } from "grammy";
import { COMMANDS } from "../src/bot.js";
import { config } from "../src/config.js";

interface TfOutputs {
  function_url?: { value: string };
  webhook_secret?: { value: string };
  log_group?: { value: string };
}

let outputs: TfOutputs;
try {
  outputs = JSON.parse(execFileSync("terraform", ["-chdir=infra", "output", "-json"], { encoding: "utf8" }));
} catch {
  console.error("Could not read terraform outputs. Run `terraform -chdir=infra apply` first.");
  process.exit(1);
}

const url = outputs.function_url?.value;
const secret = outputs.webhook_secret?.value;
if (!url || !secret) {
  console.error("terraform outputs are missing function_url or webhook_secret.");
  process.exit(1);
}

const bot = new Bot(config.BOT_TOKEN);

await bot.api.setWebhook(url, {
  secret_token: secret,
  drop_pending_updates: true,
  allowed_updates: ["message"],
});
await bot.api.setMyCommands(COMMANDS);

const info = await bot.api.getWebhookInfo();
console.log(`webhook  -> ${info.url}`);
console.log(`pending  -> ${info.pending_update_count}`);
if (info.last_error_message) console.log(`last error -> ${info.last_error_message}`);
console.log("\nSend /today to your bot. If nothing comes back, watch the logs:");
console.log(`  aws logs tail ${outputs.log_group?.value ?? "/aws/lambda/jarvis"} --follow`);
