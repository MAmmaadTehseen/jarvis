/**
 * Scheduled jobs. On AWS, EventBridge Scheduler invokes the Lambda with
 * {"job":"morning"}; locally node-cron calls the same functions.
 *
 * These have no interaction to reply to, so they post to the channel directly.
 */
import { config } from "./config.js";
import * as repo from "./db/repo.js";
import { sendMessage, sendMessageWithFile } from "./discord/api.js";
import * as fmt from "./domain/format.js";
import { slotFor } from "./domain/rotation.js";
import { consecutiveMissedDays } from "./domain/score.js";
import { addDays } from "./domain/time.js";
import { log } from "./logger.js";
import * as svc from "./service.js";

export const JOBS = ["morning", "evening", "sunday"] as const;
export type JobName = (typeof JOBS)[number];
export function isJob(s: string): s is JobName {
  return (JOBS as readonly string[]).includes(s);
}

async function post(text: string): Promise<void> {
  if (!config.DISCORD_CHANNEL_ID) {
    log.warn("DISCORD_CHANNEL_ID not set; dropping scheduled message");
    return;
  }
  const mention = config.OWNER_USER_ID ? `<@${config.OWNER_USER_ID}> ` : "";
  await sendMessage(config.DISCORD_CHANNEL_ID, mention + text);
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

export async function morning(): Promise<void> {
  await post(`Good morning.\n\n${await todayText()}`);
}

export async function evening(): Promise<void> {
  const { day, week } = svc.now();
  const slot = slotFor(day.weekday);

  if (slot.goalId === null) {
    await post("Sunday evening. If you haven't run `/review` yet, now is the time.");
    return;
  }

  const data = await repo.getWeek(week);
  const todayLogs = data.logs.filter((l) => l.date === day.date);
  const learned = data.learned.some((l) => l.date === day.date);

  if (todayLogs.length > 0) {
    const mins = todayLogs.reduce((a, l) => a + l.minutes, 0);
    const tail = learned ? "Good. `/post` gives you today's draft." : "One more thing: `/learned`. It's tomorrow's post.";
    await post(`${fmt.fmtMinutes(mins)} logged today on ${slot.label}. ${tail}`);
    return;
  }

  const logged = await svc.loggedDates([week, Math.max(0, week - 1)]);
  const missedBefore = consecutiveMissedDays(logged, addDays(day.date, -1), config.START_DATE);
  let text = `Nothing logged today (${slot.label}). Did you do it? Reply with \`/log\`, or \`/skip\` so the reason is on record.`;
  if (missedBefore >= 1) {
    text += `\n\nThat's ${missedBefore + 1} work days in a row with nothing logged. Your streaks are at risk, and Saturday's scorecard is public.`;
  }
  await post(text);
}

export async function sunday(): Promise<void> {
  const { week } = svc.now();
  await svc.recomputeStreaks(week);
  const score = await svc.getScore(week);
  const caption = `Week ${week} is done. Run \`/review\` — three questions, one form.`;

  const { renderScorecard } = await import("./scorecard.js");
  const png = await renderScorecard(score, { dateRange: svc.weekRange(week) });

  if (!png) {
    // The renderer reports its own reason. A missing image must never cost the
    // weekly post, so fall back to the text card.
    await post(`${caption}\n\`\`\`\n${fmt.scoreMessage(score)}\n\`\`\``);
    return;
  }

  if (!config.DISCORD_CHANNEL_ID) {
    log.warn("DISCORD_CHANNEL_ID not set; dropping scorecard");
    return;
  }
  const mention = config.OWNER_USER_ID ? `<@${config.OWNER_USER_ID}> ` : "";
  await sendMessageWithFile(config.DISCORD_CHANNEL_ID, mention + caption, {
    name: `jarvis-week-${week}.png`,
    data: png,
    contentType: "image/png",
  });
}

export async function runJob(name: JobName): Promise<void> {
  log.info({ job: name }, "running job");
  switch (name) {
    case "morning":
      return morning();
    case "evening":
      return evening();
    case "sunday":
      return sunday();
  }
}
