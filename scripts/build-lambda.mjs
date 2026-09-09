/**
 * Builds the Lambda deployment bundle into dist/lambda/.
 *
 * The bundle is CommonJS, and dist/lambda/package.json pins that: the repo root
 * declares "type": "module", and if that ever leaked into the zip the Node
 * runtime would parse index.js as ESM and the handler would vanish.
 */
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const outdir = "dist/lambda";

await build({
  entryPoints: ["src/lambda.ts"],
  outfile: `${outdir}/index.js`,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  minify: true,
  sourcemap: false,
  // Provided by the Lambda layer at runtime. Bundling it would pull a 29 MB
  // native binary into every deploy.
  external: ["@napi-rs/canvas"],
});

mkdirSync(outdir, { recursive: true });
writeFileSync(`${outdir}/package.json`, JSON.stringify({ type: "commonjs" }, null, 2) + "\n");

const kb = (statSync(`${outdir}/index.js`).size / 1024).toFixed(0);
console.log(`built ${outdir}/index.js (${kb} kB)`);
