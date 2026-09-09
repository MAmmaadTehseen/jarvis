/**
 * Zips dist/lambda into dist/lambda.zip, with the files at the archive root
 * (Lambda looks for index.js there, not under a directory).
 *
 * No dependency for this: `zip` exists on the CI runners, PowerShell's
 * Compress-Archive exists on Windows, and one of the two is always present.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";

const SRC = "dist/lambda";
const OUT = "dist/lambda.zip";

if (!existsSync(`${SRC}/index.js`)) {
  console.error(`${SRC}/index.js is missing. Run: npm run build:lambda`);
  process.exit(1);
}

mkdirSync("dist", { recursive: true });
rmSync(OUT, { force: true });

function tryZip() {
  execFileSync("zip", ["-qr", "../lambda.zip", "."], { cwd: SRC, stdio: "pipe" });
}

function tryPowerShell() {
  execFileSync(
    "powershell",
    ["-NoProfile", "-Command", `Compress-Archive -Path '${SRC}/*' -DestinationPath '${OUT}' -Force`],
    { stdio: "pipe" },
  );
}

let made = false;
for (const attempt of [tryZip, tryPowerShell]) {
  try {
    attempt();
    made = true;
    break;
  } catch {
    /* try the next one */
  }
}

if (!made) {
  console.error("Could not find `zip` or PowerShell to build the archive.");
  process.exit(1);
}

// A tar named .zip would sail straight through to a broken deploy, so check the
// magic bytes rather than trusting the file extension.
const magic = readFileSync(OUT).subarray(0, 4).toString("hex");
if (magic !== "504b0304") {
  console.error(`${OUT} is not a zip (magic ${magic}, expected 504b0304).`);
  process.exit(1);
}

console.log(`${OUT}  ${(statSync(OUT).size / 1024).toFixed(0)} kB`);
