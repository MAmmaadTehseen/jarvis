import { describe, expect, it } from "vitest";
import type { Goal, LogEntry, Streak, Task } from "../src/db/repo.js";
import { consecutiveMissedDays, nextStreak, scoreWeek } from "../src/domain/score.js";
import { bar, scoreMessage, fmtMinutes } from "../src/domain/format.js";

const goals: Goal[] = [
  { goalId: "jarvis", name: "Jarvis", weeklyMinutesTarget: 180, order: 1, active: true },
  { goalId: "aws", name: "AWS", weeklyMinutesTarget: 60, order: 2, active: true },
  { goalId: "old", name: "Old", weeklyMinutesTarget: 60, order: 3, active: false },
];

const log = (goalId: string, minutes: number, date = "2026-09-14"): LogEntry => ({
  goalId,
  minutes,
  date,
  week: 1,
  note: "n",
  createdAt: `${date}T10:00:00Z`,
});
const task = (goalId: string, status: Task["status"]): Task => ({
  pk: "WEEK#1",
  sk: "TASK#x",
  taskId: "x",
  week: 1,
  goalId,
  title: "t",
  status,
  createdAt: "2026-09-14T00:00:00Z",
});

describe("scoreWeek", () => {
  it("sums minutes per goal, caps pct at 1, counts tasks, ignores inactive goals", () => {
    const s = scoreWeek(
      1,
      goals,
      { tasks: [task("jarvis", "done"), task("jarvis", "todo"), task("aws", "skipped")], logs: [log("jarvis", 100), log("jarvis", 50), log("aws", 90)] },
      [{ goalId: "aws", count: 2, lastWeek: 0 }],
    );
    expect(s.goals.map((g) => g.goalId)).toEqual(["jarvis", "aws"]);
    expect(s.goals[0]).toMatchObject({ minutes: 150, target: 180, tasksDone: 1, tasksTotal: 2, streak: 0 });
    expect(s.goals[0]!.pct).toBeCloseTo(150 / 180);
    expect(s.goals[1]).toMatchObject({ minutes: 90, pct: 1, tasksDone: 0, tasksTotal: 1, streak: 2 });
    expect(s.totalMinutes).toBe(240);
    expect(s.tasksDone).toBe(1);
    expect(s.tasksTotal).toBe(3);
  });

  it("renders a scorecard", () => {
    const s = scoreWeek(1, goals, { tasks: [], logs: [log("aws", 60)] }, []);
    const text = scoreMessage(s);
    expect(text).toContain("Week 1 scorecard");
    expect(text).toContain("AWS    ▓▓▓▓▓▓▓▓▓▓ 1h/1h");
    expect(text).toContain("Jarvis ░░░░░░░░░░ 0m/3h");
  });
});

describe("nextStreak", () => {
  it("increments on hit, resets on miss, and is idempotent per week", () => {
    const s1 = nextStreak(undefined, "aws", 1, 60, 60);
    expect(s1).toEqual<Streak>({ goalId: "aws", count: 1, lastWeek: 1 });
    expect(nextStreak(s1, "aws", 1, 0, 60)).toBe(s1); // same week again: unchanged
    const s2 = nextStreak(s1, "aws", 2, 75, 60);
    expect(s2.count).toBe(2);
    const s3 = nextStreak(s2, "aws", 3, 10, 60);
    expect(s3.count).toBe(0);
  });
});

describe("consecutiveMissedDays", () => {
  const start = "2026-09-14";
  it("counts back from yesterday, skipping Sundays, stopping at a logged day", () => {
    // logged Mon 14th only; asking on Thu 17th evening about days ending Wed 16th
    expect(consecutiveMissedDays(new Set(["2026-09-14"]), "2026-09-16", start)).toBe(2);
    // Sunday 20th is skipped: Sat 19th missed, Sun skipped, Mon 21st missed -> 2
    expect(consecutiveMissedDays(new Set(["2026-09-18"]), "2026-09-21", start)).toBe(2);
  });
  it("never counts days before the journey started", () => {
    expect(consecutiveMissedDays(new Set(), "2026-09-13", start)).toBe(0);
    expect(consecutiveMissedDays(new Set(), "2026-09-15", start)).toBe(2);
  });
});

describe("format helpers", () => {
  it("bars and minutes", () => {
    expect(bar(0)).toBe("░░░░░░░░░░");
    expect(bar(0.5)).toBe("▓▓▓▓▓░░░░░");
    expect(bar(2)).toBe("▓▓▓▓▓▓▓▓▓▓");
    expect(fmtMinutes(0)).toBe("0m");
    expect(fmtMinutes(45)).toBe("45m");
    expect(fmtMinutes(60)).toBe("1h");
    expect(fmtMinutes(90)).toBe("1.5h");
    expect(fmtMinutes(180)).toBe("3h");
  });
});
