import type { Goal, LogEntry, Streak, Task } from "../db/repo.js";
import { addDays, weekdayOf } from "./time.js";

export interface GoalScore {
  goalId: string;
  name: string;
  minutes: number;
  target: number;
  /** 0..1, capped at 1 */
  pct: number;
  tasksDone: number;
  tasksTotal: number;
  streak: number;
}

export interface WeekScore {
  week: number;
  goals: GoalScore[];
  totalMinutes: number;
  tasksDone: number;
  tasksTotal: number;
}

export function minutesByGoal(logs: LogEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of logs) m.set(l.goalId, (m.get(l.goalId) ?? 0) + l.minutes);
  return m;
}

export function scoreWeek(
  week: number,
  goals: Goal[],
  data: { tasks: Task[]; logs: LogEntry[] },
  streaks: Streak[],
): WeekScore {
  const minutes = minutesByGoal(data.logs);
  const streakBy = new Map(streaks.map((s) => [s.goalId, s.count]));
  const scored: GoalScore[] = goals
    .filter((g) => g.active)
    .sort((a, b) => a.order - b.order)
    .map((g) => {
      const mins = minutes.get(g.goalId) ?? 0;
      const tasks = data.tasks.filter((t) => t.goalId === g.goalId);
      return {
        goalId: g.goalId,
        name: g.name,
        minutes: mins,
        target: g.weeklyMinutesTarget,
        pct: g.weeklyMinutesTarget > 0 ? Math.min(1, mins / g.weeklyMinutesTarget) : 0,
        tasksDone: tasks.filter((t) => t.status === "done").length,
        tasksTotal: tasks.length,
        streak: streakBy.get(g.goalId) ?? 0,
      };
    });
  return {
    week,
    goals: scored,
    totalMinutes: scored.reduce((a, g) => a + g.minutes, 0),
    tasksDone: data.tasks.filter((t) => t.status === "done").length,
    tasksTotal: data.tasks.length,
  };
}

/**
 * Streak = consecutive weeks a goal hit its minutes target.
 * Idempotent per week: calling it twice for the same week returns the stored value.
 */
export function nextStreak(prev: Streak | undefined, goalId: string, week: number, minutes: number, target: number): Streak {
  if (prev && prev.lastWeek >= week) return prev;
  const hit = minutes >= target;
  return { goalId, count: hit ? (prev?.count ?? 0) + 1 : 0, lastWeek: week };
}

/**
 * How many work days in a row (ending on `endingOn`) had no log at all.
 * Sundays are review days and are skipped. Never counts days before `notBefore`.
 */
export function consecutiveMissedDays(logged: Set<string>, endingOn: string, notBefore: string, lookback = 14): number {
  let missed = 0;
  for (let i = 0; i < lookback; i++) {
    const d = addDays(endingOn, -i);
    if (d < notBefore) break;
    if (weekdayOf(d) === 0) continue;
    if (logged.has(d)) break;
    missed++;
  }
  return missed;
}
