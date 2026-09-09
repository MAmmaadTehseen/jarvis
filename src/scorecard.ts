/**
 * Renders the weekly scorecard as a PNG, for posting.
 *
 * @napi-rs/canvas ships a ~29 MB Skia binary, so it lives in a Lambda layer and
 * is imported lazily: nothing on the interaction path pays for it, and Discord's
 * 3-second limit stays comfortable. The weekly job is the only caller, and it
 * runs on a 30-second EventBridge invoke.
 *
 * Lambda has no system fonts. Skia renders blank without a registered font, so
 * the two weights in assets/fonts are loaded explicitly.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "./logger.js";
import type { WeekScore } from "./domain/score.js";
import { fmtMinutes } from "./domain/format.js";

const W = 1200;
const PAD = 64;
const ROW_H = 76;
const HEADER_H = 190;
const FOOTER_H = 96;

const INK = "#e9ebf1";
const MUTED = "#9aa1b4";
const FAINT = "#5f6678";
const GROUND = "#12141b";
const PANEL = "#191c25";
const ACCENT = "#8b8df5";
const DONE = "#45c39d";
const WARN = "#e0a445";

const REG = "JarvisMono";
const BOLD = "JarvisMonoBold";

let fontsReady = false;

/** Font files sit beside the bundle in Lambda and at the repo root in dev. */
function fontDir(): string | undefined {
  for (const dir of [join(process.cwd(), "assets", "fonts"), "/var/task/assets/fonts", "/opt/assets/fonts"]) {
    if (existsSync(join(dir, "JetBrainsMono_400Regular.ttf"))) return dir;
  }
  return undefined;
}

type Canvas = typeof import("@napi-rs/canvas");

async function loadCanvas(): Promise<Canvas> {
  const mod = (await import("@napi-rs/canvas")) as Canvas;
  if (!fontsReady) {
    const dir = fontDir();
    if (!dir) throw new Error("could not find assets/fonts - the scorecard would render blank");
    mod.GlobalFonts.registerFromPath(join(dir, "JetBrainsMono_400Regular.ttf"), REG);
    mod.GlobalFonts.registerFromPath(join(dir, "JetBrainsMono_700Bold.ttf"), BOLD);
    fontsReady = true;
  }
  return mod;
}

function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

/**
 * Returns a PNG buffer, or undefined when the layer is missing. Callers fall
 * back to text: a failed image should never cost you the weekly post.
 */
export async function renderScorecard(score: WeekScore, opts: { dateRange: string }): Promise<Buffer | undefined> {
  let canvas: Canvas;
  try {
    canvas = await loadCanvas();
  } catch (err) {
    log.warn({ err }, "scorecard renderer unavailable, falling back to text");
    return undefined;
  }

  const rows = score.goals;
  const height = HEADER_H + rows.length * ROW_H + FOOTER_H;
  const img = canvas.createCanvas(W, height);
  const ctx = img.getContext("2d");

  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, W, height);

  // Header
  ctx.fillStyle = ACCENT;
  ctx.font = `28px ${BOLD}`;
  ctx.fillText("BUILDING JARVIS IN PUBLIC", PAD, 74);

  ctx.fillStyle = INK;
  ctx.font = `64px ${BOLD}`;
  ctx.fillText(`Week ${score.week}`, PAD, 146);

  ctx.fillStyle = FAINT;
  ctx.font = `26px ${REG}`;
  const range = opts.dateRange;
  ctx.fillText(range, W - PAD - ctx.measureText(range).width, 146);

  ctx.strokeStyle = "#262b37";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, HEADER_H - 26);
  ctx.lineTo(W - PAD, HEADER_H - 26);
  ctx.stroke();

  // One row per goal: name, bar, time, streak
  const nameW = 190;
  const barX = PAD + nameW;
  const barW = 520;
  const barH = 18;

  // score.pct is capped at 1, which would draw every goal that hit its target
  // as an identical full bar. Scale the axis past 100% instead and mark the
  // target, so beating it is visible rather than flattened away.
  const ratios = rows.map((g) => (g.target > 0 ? g.minutes / g.target : 0));
  const axisMax = Math.max(1.25, ...ratios);
  const targetX = barX + (barW * 1) / axisMax;

  rows.forEach((g, i) => {
    const y = HEADER_H + i * ROW_H;
    const mid = y + ROW_H / 2;

    ctx.fillStyle = INK;
    ctx.font = `30px ${BOLD}`;
    ctx.fillText(g.name, PAD, mid + 10);

    ctx.fillStyle = PANEL;
    roundRect(ctx, barX, mid - barH / 2, barW, barH, barH / 2);

    // Amber below target, green at or above it. Colour carries the same
    // information as the number, so the card reads at a glance.
    const ratio = ratios[i]!;
    const hit = g.minutes >= g.target;
    if (ratio > 0) {
      ctx.fillStyle = hit ? DONE : WARN;
      roundRect(ctx, barX, mid - barH / 2, Math.max(barH, (barW * ratio) / axisMax), barH, barH / 2);
    }

    // The target tick. Everything to its right is time beyond the commitment.
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(targetX, mid - barH / 2 - 7);
    ctx.lineTo(targetX, mid + barH / 2 + 7);
    ctx.stroke();

    ctx.fillStyle = hit ? DONE : MUTED;
    ctx.font = `26px ${REG}`;
    ctx.fillText(`${fmtMinutes(g.minutes)} / ${fmtMinutes(g.target)}`, barX + barW + 28, mid + 9);

    if (g.streak > 0) {
      const s = `${g.streak}w streak`;
      ctx.fillStyle = ACCENT;
      ctx.font = `24px ${BOLD}`;
      ctx.fillText(s, W - PAD - ctx.measureText(s).width, mid + 9);
    }
  });

  // Footer totals
  const fy = HEADER_H + rows.length * ROW_H + 30;
  ctx.strokeStyle = "#262b37";
  ctx.beginPath();
  ctx.moveTo(PAD, fy);
  ctx.lineTo(W - PAD, fy);
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.font = `30px ${BOLD}`;
  ctx.fillText(`${fmtMinutes(score.totalMinutes)} logged`, PAD, fy + 46);

  ctx.fillStyle = MUTED;
  ctx.font = `30px ${REG}`;
  const tasks = `${score.tasksDone}/${score.tasksTotal} tasks done`;
  ctx.fillText(tasks, W - PAD - ctx.measureText(tasks).width, fy + 46);

  return img.encode("png");
}
