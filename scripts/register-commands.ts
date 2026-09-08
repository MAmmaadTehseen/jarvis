/**
 * Publishes the slash commands to Discord. Run after changing src/discord/commands.ts:
 *   npm run register
 *
 * Global commands can take a few minutes to appear in every client.
 */
import { getApplication, putGlobalCommands } from "../src/discord/api.js";
import { COMMANDS } from "../src/discord/commands.js";

const app = await getApplication();
console.log(`app: ${app.name} (${app.id})`);

await putGlobalCommands(COMMANDS);
console.log(`registered ${COMMANDS.length} commands: ${COMMANDS.map((c) => "/" + c.name).join(" ")}`);
console.log("\nGlobal commands can take a few minutes to show up. Type / in your server to check.");
