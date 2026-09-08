import type { Goal, Learned, LogEntry, Review, Task } from "../db/repo.js";
import type { WeekScore } from "./score.js";
import type { Slot } from "./rotation.js";
import type { DayInfo } from "./time.js";

export function bar(pct: number, width = 10): string {
  const filled = Math.max(0, Math.min(width, Math.round(pct * width)));
  return "▓".repeat(filled) + "░".repeat(width - filled);
}

export function fmtMinutes(m: number): string {
  if (m === 0) return "0m";
  if (m % 60 === 0) return `${m / 60}h`;
  if (m > 60) return `${(m / 60).toFixed(1)}h`;
  return `${m}m`;
}

export function todayMessage(opts: {
  day: DayInfo;
  week: number;
  dayN: number;
  slot: Slot;
  goal: Goal | undefined;
  task: Task | undefined;
  loggedToday: number;
  learnedToday: boolean;
}): string {
  const { day, week, dayN, slot, task, loggedToday, learnedToday } = opts;
  const head = `${day.weekdayName} ${day.date} · Week ${week}${dayN > 0 ? ` · Day ${dayN}` : ""}`;
  const lines = [head, `Slot: ${slot.label} (${slot.minutes} min)`];
  if (slot.goalId === null) {
    lines.push("", slot.hint);
    return lines.join("\n");
  }
  lines.push(task ? `Task: ${task.title}` : `Task: none yet. ${slot.hint} (/add sets one)`);
  lines.push(`Logged today: ${fmtMinutes(loggedToday)}${learnedToday ? " · learned ✓" : ""}`);
  lines.push("", "When you are done: /log, then /learned. /done marks the task, /skip records why not.");
  return lines.join("\n");
}

/** Column-aligned, so callers wrap it in a code block. */
export function scoreMessage(score: WeekScore): string {
  const nameW = Math.max(...score.goals.map((g) => g.name.length), 4);
  const rows = score.goals.map((g) => {
    const name = g.name.padEnd(nameW);
    const time = `${fmtMinutes(g.minutes)}/${fmtMinutes(g.target)}`.padEnd(9);
    const tasks = g.tasksTotal ? `tasks ${g.tasksDone}/${g.tasksTotal}` : "tasks -";
    const streak = g.streak > 0 ? ` · 🔥${g.streak}` : "";
    return `${name} ${bar(g.pct)} ${time} ${tasks}${streak}`;
  });
  rows.push("", `Total ${fmtMinutes(score.totalMinutes)} · tasks ${score.tasksDone}/${score.tasksTotal}`);
  return `Week ${score.week} scorecard\n\n${rows.join("\n")}`;
}

export function weekMessage(week: number, tasks: Task[], goals: Map<string, Goal>): string {
  if (tasks.length === 0) return `Week ${week}: no tasks yet. Add one with /add.`;
  const mark = (t: Task) => (t.status === "done" ? "✅" : t.status === "skipped" ? "⏭" : "▢");
  const lines = tasks.map((t, i) => {
    const g = goals.get(t.goalId)?.name ?? t.goalId;
    const extra = t.status === "skipped" && t.skipReason ? ` (${t.skipReason})` : "";
    return `${i + 1}. ${mark(t)} [${g}] ${t.title}${extra}`;
  });
  return `**Week ${week} tasks**\n${lines.join("\n")}\n\nUse the number with /done or /skip.`;
}

export function goalsMessage(goals: Goal[]): string {
  const lines = goals.filter((g) => g.active).sort((a, b) => a.order - b.order).map((g) => `• ${g.goalId}: ${g.name}, ${fmtMinutes(g.weeklyMinutesTarget)}/week`);
  return `**Goals**\n${lines.join("\n")}`;
}

export function dailyPostDraft(opts: { dayN: number; date: string; logs: LogEntry[]; learned: Learned | undefined }): string {
  const { dayN, date, logs, learned } = opts;
  const did = logs.length ? logs.map((l) => l.note).filter(Boolean).join("; ") : "(nothing logged yet — use /log)";
  const head = dayN > 0 ? `Day ${dayN} of building Jarvis in public.` : `Building Jarvis in public, ${date}.`;
  return [
    head,
    "",
    `Did: ${did}`,
    `Learned: ${learned?.text ?? "(add one with /learned)"}`,
    "Broke: (fill in, or delete this line)",
    "",
    "#buildinpublic #aws #devops #typescript",
  ].join("\n");
}

export function weeklyPostDraft(score: WeekScore, review: Review | undefined): string {
  const hours = score.goals.map((g) => `${g.name} ${fmtMinutes(g.minutes)}`).join(" · ");
  const streaks = score.goals.filter((g) => g.streak > 0).map((g) => `${g.name} ${g.streak}w`).join(" · ");
  return [
    `Week ${score.week} of building Jarvis in public: the scorecard.`,
    "",
    `Shipped: ${review?.shipped ?? "(run /review)"}`,
    `Slipped: ${review?.slipped ?? "(run /review)"}`,
    `Lesson: ${review?.lesson ?? "(run /review)"}`,
    "",
    `Hours: ${hours}`,
    `Tasks: ${score.tasksDone}/${score.tasksTotal}`,
    streaks ? `Streaks: ${streaks}` : "Streaks: none yet",
    "",
    "#buildinpublic #aws #devops #typescript",
  ].join("\n");
}

export const HELP = [
  "**Jarvis** keeps you on one task a day.",
  "",
  "Rotation: Mon Jarvis / Tue AWS / Wed Jarvis / Thu DevOps / Fri Freelance / Sat Content / Sun Review",
  "",
  "`/today` what today's slot and task are",
  "`/log minutes: note: [goal:]` record time",
  "`/learned text:` the one line that becomes today's post",
  "`/done [n:]` and `/skip reason: [n:]` task status",
  "`/week` this week's tasks, `/add task: [goal:]` add one",
  "`/score` minutes vs target, tasks, streaks",
  "`/review` the Sunday form, three questions",
  "`/post [scope:]` a LinkedIn draft from real data",
  "`/park idea:` park it until Sunday, `/parked` list them",
  "`/goals` goals and weekly targets",
  "",
  "Nudges: 09:00 today's task, 21:00 did you do it, Sunday 19:00 the scorecard.",
].join("\n");
