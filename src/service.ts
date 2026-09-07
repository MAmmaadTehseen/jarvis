/**
 * Application services shared by the bot commands and the scheduled jobs.
 */
import { config } from "./config.js";
import * as repo from "./db/repo.js";
import { nextStreak, scoreWeek, type WeekScore, minutesByGoal } from "./domain/score.js";
import { dayInfo, dayNumber, weekNumber, type DayInfo } from "./domain/time.js";

export interface Now {
  day: DayInfo;
  week: number;
  dayN: number;
}

export function now(at: Date = new Date()): Now {
  const day = dayInfo(config.TZ_NAME, at);
  return { day, week: weekNumber(config.START_DATE, day.date), dayN: dayNumber(config.START_DATE, day.date) };
}

export async function goalsById(): Promise<Map<string, repo.Goal>> {
  const goals = await repo.listGoals();
  return new Map(goals.map((g) => [g.goalId, g]));
}

export async function getScore(week: number): Promise<WeekScore> {
  const [goals, data, streaks] = await Promise.all([repo.listGoals(), repo.getWeek(week), repo.listStreaks()]);
  return scoreWeek(week, goals, data, streaks);
}

/** Recompute every goal's streak for the given week. Safe to run more than once. */
export async function recomputeStreaks(week: number): Promise<repo.Streak[]> {
  const [goals, data, streaks] = await Promise.all([repo.listGoals(), repo.getWeek(week), repo.listStreaks()]);
  const minutes = minutesByGoal(data.logs);
  const prevBy = new Map(streaks.map((s) => [s.goalId, s]));
  const out: repo.Streak[] = [];
  for (const g of goals) {
    if (!g.active) continue;
    const prev = prevBy.get(g.goalId);
    const next = nextStreak(prev, g.goalId, week, minutes.get(g.goalId) ?? 0, g.weeklyMinutesTarget);
    if (next !== prev) await repo.putStreak(next);
    out.push(next);
  }
  return out;
}

/** Set of dates that have at least one log, across the given weeks. */
export async function loggedDates(weeks: number[]): Promise<Set<string>> {
  const set = new Set<string>();
  for (const w of weeks) {
    const data = await repo.getWeek(w);
    for (const l of data.logs) set.add(l.date);
  }
  return set;
}
