/**
 * Builds the Lambda layer: the Skia binary that renders the scorecard, plus the
 * fonts it needs. ~29 MB unpacked, which is why it is a layer and not part of
 * the function - CI deploys stay small and fast.
 *
 * Terraform owns this (it changes about never). CI owns the function code.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUT = "dist/layer";
const MODULES = `${OUT}/nodejs/node_modules/@napi-rs`;
const PLATFORM = "@napi-rs/canvas-linux-arm64-gnu"; // matches architectures = ["arm64"]

rmSync(OUT, { recursive: true, force: true });
mkdirSync(MODULES, { recursive: true });

// The arm64 Linux binary is an optionalDependency that npm skips on Windows,
// so ask for it by name rather than hoping the host platform matches Lambda.
if (!existsSync(`node_modules/${PLATFORM}`)) {
  console.log(`installing ${PLATFORM}...`);
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  execFileSync(npm, ["install", "-D", PLATFORM, "--no-audit", "--no-fund", "--force"], { stdio: "inherit" });
}

for (const pkg of ["@napi-rs/canvas", PLATFORM]) {
  cpSync(`node_modules/${pkg}`, `${OUT}/nodejs/node_modules/${pkg}`, { recursive: true });
}

// Lambda has no system fonts; Skia renders blank without these.
cpSync("assets/fonts", `${OUT}/assets/fonts`, { recursive: true });

console.log(`built ${OUT} (layer: canvas + fonts)`);
