/**
 * Builds the Lambda layer: the Skia binary that renders the scorecard, plus the
 * fonts it needs. ~29 MB unpacked, which is why it is a layer and not part of
 * the function - CI deploys stay a few hundred kilobytes.
 *
 * Terraform owns this (it changes about never). CI owns the function code.
 *
 * The linux/arm64 binary is fetched here rather than declared as a
 * devDependency: npm refuses to resolve a glibc/arm64 package on a Windows
 * host, which breaks `npm install` and `npm ci` for the whole project.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUT = "dist/layer";
const DEPS = "dist/.layerdeps";
const PLATFORM = "@napi-rs/canvas-linux-arm64-gnu"; // matches architectures = ["arm64"]

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
// shell:true is needed for npm.cmd on Windows under Node 24, which refuses to
// spawnSync a .cmd directly. Every argument passed below is a literal.
const spawn = { stdio: "inherit", shell: process.platform === "win32" };

/**
 * Read package.json directly rather than shelling out to `npm pkg get`: it
 * needs no subprocess, and the binary has to match the canvas version exactly
 * or Skia fails to load at runtime.
 */
function version() {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  return pkg.devDependencies["@napi-rs/canvas"].replace(/[^0-9.]/g, "");
}

/**
 * `npm install` refuses a foreign-platform package even when it is named
 * explicitly and --os/--cpu/--libc are passed; only --force gets past it, and
 * that disables rather more than it needs to. `npm pack` just downloads the
 * tarball, with no platform check to bypass in the first place.
 */
function fetchPlatformBinary(dir, ver) {
  mkdirSync(dir, { recursive: true });
  execFileSync(npm, ["pack", `${PLATFORM}@${ver}`, "--pack-destination", dir, "--silent"], spawn);

  const tgz = readdirSync(dir).find((f) => f.endsWith(".tgz"));
  if (!tgz) throw new Error(`npm pack produced no tarball in ${dir}`);

  // tar handles .tgz on Windows 10+ (bsdtar), macOS and Linux alike.
  execFileSync("tar", ["-xzf", `${dir}/${tgz}`, "-C", dir], { stdio: "inherit" });
}

const ver = version();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/nodejs/node_modules/@napi-rs`, { recursive: true });

if (!existsSync(`${DEPS}/package/package.json`)) {
  console.log(`fetching ${PLATFORM}@${ver}...`);
  rmSync(DEPS, { recursive: true, force: true });
  fetchPlatformBinary(DEPS, ver);
}

// npm pack unwraps every package into a directory called "package"; it has to
// land under its real name for require() to resolve it inside the layer.
cpSync("node_modules/@napi-rs/canvas", `${OUT}/nodejs/node_modules/@napi-rs/canvas`, { recursive: true });
cpSync(`${DEPS}/package`, `${OUT}/nodejs/node_modules/${PLATFORM}`, { recursive: true });

// Lambda has no system fonts; Skia renders blank without these.
cpSync("assets/fonts", `${OUT}/assets/fonts`, { recursive: true });

console.log(`built ${OUT} (canvas ${ver} + fonts)`);
