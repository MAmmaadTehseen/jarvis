/**
 * Scheduled jobs. Locally node-cron calls these directly; on AWS, EventBridge
 * Scheduler POSTs to /cron/<job> and the server calls them.
 */
import type { Bot } from "grammy";
import { config } from "./config.js";
import * as repo from "./db/repo.js";
import * as svc from "./service.js";
import * as fmt from "./domain/format.js";
import { slotFor } from "./domain/rotation.js";
import { consecutiveMissedDays } from "./domain/score.js";
import { addDays } from "./domain/time.js";
import { log } from "./logger.js";
import { startReview } from "./bot.js";

export const JOBS = ["morning", "evening", "sunday"] as const;
export type JobName = (typeof JOBS)[number];
export function isJob(s: string): s is JobName {
  return (JOBS as readonly string[]).includes(s);
}

async function send(bot: Bot, text: string, html = false): Promise<void> {
  if (!config.OWNER_CHAT_ID) {
    log.warn("OWNER_CHAT_ID not set; skipping scheduled message");
    return;
  }
  await bot.api.sendMessage(config.OWNER_CHAT_ID, text, html ? { parse_mode: "HTML" } : undefined);
}

export async function todayText(): Promise<string> {
  const { day, week, dayN } = svc.now();
  const slot = slotFor(day.weekday);
  const [goals, data] = await Promise.all([svc.goalsById(), repo.getWeek(week)]);
  const goal = slot.goalId ? goals.get(slot.goalId) : undefined;
  const task = data.tasks.find((t) => t.status === "todo" && t.goalId === slot.goalId) ?? data.tasks.find((t) => t.status === "todo");
  const loggedToday = data.logs.filter((l) => l.date === day.date).reduce((a, l) => a + l.minutes, 0);
  const learnedToday = data.learned.some((l) => l.date === day.date);
  return fmt.todayMessage({ day, week, dayN, slot, goal, task, loggedToday, learnedToday });
}

export async function morning(bot: Bot): Promise<void> {
  await send(bot, `Good morning.\n\n${await todayText()}`);
}

export async function evening(bot: Bot): Promise<void> {
  const { day, week } = svc.now();
  const slot = slotFor(day.weekday);
  if (slot.goalId === null) {
    await send(bot, "Sunday evening. If you haven't run /review yet, now is the time.");
    return;
  }
  const data = await repo.getWeek(week);
  const todayLogs = data.logs.filter((l) => l.date === day.date);
  const learned = data.learned.some((l) => l.date === day.date);

  if (todayLogs.length > 0) {
    const mins = todayLogs.reduce((a, l) => a + l.minutes, 0);
    const tail = learned ? "Good. /post gives you today's draft." : "One more thing: /learned <one line>. It's tomorrow's post.";
    await send(bot, `${fmt.fmtMinutes(mins)} logged today on ${slot.label}. ${tail}`);
    return;
  }

  const logged = await svc.loggedDates([week, Math.max(0, week - 1)]);
  const missedBefore = consecutiveMissedDays(logged, addDays(day.date, -1), config.START_DATE);
  let text = `Nothing logged today (${slot.label}). Did you do it? Reply /log <minutes> <note>, or /skip <reason> so it's on record.`;
  if (missedBefore >= 1) {
    text += `\n\nThat's ${missedBefore + 1} work days in a row with nothing logged. Your streaks are at risk, and Saturday's scorecard is public.`;
  }
  await send(bot, text);
}

export async function sunday(bot: Bot): Promise<void> {
  const { week } = svc.now();
  await svc.recomputeStreaks(week);
  const score = await svc.getScore(week);
  await send(bot, `<pre>${fmt.escapeHtml(fmt.scoreMessage(score))}</pre>`, true);
  if (config.OWNER_CHAT_ID) await startReview(bot, Number(config.OWNER_CHAT_ID), week);
}

export async function runJob(name: JobName, bot: Bot): Promise<void> {
  log.info({ job: name }, "running job");
  switch (name) {
    case "morning":
      return morning(bot);
    case "evening":
      return evening(bot);
    case "sunday":
      return sunday(bot);
  }
}
