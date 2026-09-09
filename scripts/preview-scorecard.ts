/** Renders a sample scorecard to dist/scorecard-preview.png so it can be eyeballed. */
import { writeFileSync } from "node:fs";
import { renderScorecard } from "../src/scorecard.js";
import { scoreWeek } from "../src/domain/score.js";
import type { Goal, LogEntry, Task } from "../src/db/repo.js";

const goals: Goal[] = [
  { goalId: "jarvis", name: "Jarvis", weeklyMinutesTarget: 180, order: 1, active: true },
  { goalId: "aws", name: "AWS", weeklyMinutesTarget: 60, order: 2, active: true },
  { goalId: "devops", name: "DevOps", weeklyMinutesTarget: 60, order: 3, active: true },
  { goalId: "freelance", name: "Freelance", weeklyMinutesTarget: 60, order: 4, active: true },
  { goalId: "content", name: "Content", weeklyMinutesTarget: 30, order: 5, active: true },
];
const log = (goalId: string, minutes: number): LogEntry => ({ goalId, minutes, date: "2026-09-15", week: 1, note: "n", createdAt: "" });
const task = (goalId: string, status: Task["status"]): Task => ({ pk: "", sk: "", taskId: "", week: 1, goalId, title: "t", status, createdAt: "" });

const score = scoreWeek(
  1,
  goals,
  {
    tasks: [task("jarvis", "done"), task("jarvis", "done"), task("aws", "done"), task("devops", "todo"), task("freelance", "skipped"), task("content", "done")],
    logs: [log("jarvis", 195), log("aws", 60), log("devops", 90), log("freelance", 25), log("content", 30)],
  },
  [
    { goalId: "jarvis", count: 3, lastWeek: 1 },
    { goalId: "aws", count: 1, lastWeek: 1 },
  ],
);

const png = await renderScorecard(score, { dateRange: "14 Sep - 20 Sep 2026" });
if (!png) {
  console.error("renderer unavailable");
  process.exit(1);
}
writeFileSync("dist/scorecard-preview.png", png);
console.log(`dist/scorecard-preview.png  ${(png.length / 1024).toFixed(0)} kB`);
