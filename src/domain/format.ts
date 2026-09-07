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

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
  lines.push(task ? `Task: ${task.title}` : `Task: none yet. ${slot.hint} (/add to set one)`);
  lines.push(`Logged today: ${fmtMinutes(loggedToday)}${learnedToday ? " · learned ✓" : ""}`);
  lines.push("", "When you're done: /log 60 what you did, then /learned one line. /done marks the task. /skip reason if not today.");
  return lines.join("\n");
}

/** Preformatted; send inside <pre> with parse_mode HTML. */
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
  if (tasks.length === 0) return `Week ${week}: no tasks yet. Add one with /add <goal> <task>\nGoals: ${[...goals.keys()].join(", ")}`;
  const mark = (t: Task) => (t.status === "done" ? "✅" : t.status === "skipped" ? "⏭" : "▢");
  const lines = tasks.map((t, i) => {
    const g = goals.get(t.goalId)?.name ?? t.goalId;
    const extra = t.status === "skipped" && t.skipReason ? ` (${t.skipReason})` : "";
    return `${i + 1}. ${mark(t)} [${g}] ${t.title}${extra}`;
  });
  return `Week ${week} tasks\n\n${lines.join("\n")}\n\n/done n · /skip n reason`;
}

export function goalsMessage(goals: Goal[]): string {
  const lines = goals.filter((g) => g.active).sort((a, b) => a.order - b.order).map((g) => `• ${g.goalId}: ${g.name}, ${fmtMinutes(g.weeklyMinutesTarget)}/week`);
  return `Goals\n\n${lines.join("\n")}`;
}

export function dailyPostDraft(opts: { dayN: number; date: string; logs: LogEntry[]; learned: Learned | undefined }): string {
  const { dayN, date, logs, learned } = opts;
  const did = logs.length ? logs.map((l) => l.note).filter(Boolean).join("; ") : "(nothing logged yet, /log 60 what you did)";
  const head = dayN > 0 ? `Day ${dayN} of building Jarvis in public.` : `Building Jarvis in public, ${date}.`;
  return [
    head,
    "",
    `Did: ${did}`,
    `Learned: ${learned?.text ?? "(add with /learned one line)"}`,
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

export const REVIEW_QUESTIONS = [
  "1/3 What shipped this week? (one or two lines)",
  "2/3 What slipped, and why?",
  "3/3 One lesson you'd tell last-Monday you.",
] as const;

export const HELP = [
  "Jarvis keeps you on one task a day.",
  "",
  "Rotation: Mon Jarvis · Tue AWS · Wed Jarvis · Thu DevOps · Fri Freelance · Sat Content · Sun Review",
  "",
  "/today  what's today's slot and task",
  "/log 60 <note>  record minutes (add a goal id to log against another goal: /log 30 aws ...)",
  "/learned <line>  one thing you learned today (drives the daily post)",
  "/done [n]  mark a task done (default: today's first open task)",
  "/skip [n] <reason>  skip a task with a reason",
  "/week  this week's tasks",
  "/add [goal] <task>  add a task (default goal: today's slot)",
  "/score  this week's scorecard",
  "/review  Sunday review, 3 questions",
  "/post  today's LinkedIn draft · /post week  the weekly one",
  "/park <idea>  park an idea for Sunday · /parked  list them",
  "/goals  goals and targets",
  "",
  "Nudges: 09:00 today's task · 21:00 did you do it? · Sun 19:00 review.",
].join("\n");
