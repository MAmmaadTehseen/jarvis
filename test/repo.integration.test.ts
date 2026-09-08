/**
 * Runs only when DynamoDB Local is reachable (docker compose up -d).
 * Uses its own table name so it never touches real data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.BOT_TOKEN ??= "test-token";
process.env.TABLE_NAME = "jarvis_test";
process.env.DYNAMODB_ENDPOINT ??= "http://localhost:8001";

async function reachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { method: "GET", signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

const endpoint = process.env.DYNAMODB_ENDPOINT!;
const up = await reachable(endpoint);

describe.skipIf(!up)("repo against DynamoDB Local", () => {
  let repo: typeof import("../src/db/repo.js");
  let svc: typeof import("../src/service.js");
  let ddb: typeof import("../src/db/client.js");

  beforeAll(async () => {
    ddb = await import("../src/db/client.js");
    repo = await import("../src/db/repo.js");
    svc = await import("../src/service.js");
    await ddb.ensureTable();
    const { GOAL_SEEDS } = await import("../src/domain/rotation.js");
    await repo.ensureGoals(GOAL_SEEDS);
  });

  afterAll(async () => {
    if (!ddb) return;
    const { DeleteTableCommand } = await import("@aws-sdk/client-dynamodb");
    await ddb.ddb.send(new DeleteTableCommand({ TableName: "jarvis_test" }));
  });

  it("seeds goals once", async () => {
    const goals = await repo.listGoals();
    expect(goals.map((g) => g.goalId).sort()).toEqual(["aws", "content", "devops", "freelance", "jarvis"]);
  });

  it("stores a week's tasks, logs, learned line and review in one partition", async () => {
    const week = 99;
    const t = await repo.addTask(week, "aws", "write terraform");
    await repo.addLog(week, "2026-09-15", "aws", 45, "did terraform");
    await repo.addLog(week, "2026-09-15", "aws", 30, "more terraform");
    await repo.setLearned(week, "2026-09-15", "state locking matters");
    await repo.setTaskStatus(t, "done");
    await repo.putReview({ week, shipped: "a", slipped: "b", lesson: "c", createdAt: new Date().toISOString() });

    const data = await repo.getWeek(week);
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0]!.status).toBe("done");
    expect(data.logs).toHaveLength(2);
    expect(data.learned[0]!.text).toBe("state locking matters");
    expect(data.review?.lesson).toBe("c");

    const score = await svc.getScore(week);
    const aws = score.goals.find((g) => g.goalId === "aws")!;
    expect(aws.minutes).toBe(75);
    expect(aws.tasksDone).toBe(1);

    const streaks = await svc.recomputeStreaks(week);
    expect(streaks.find((s) => s.goalId === "aws")?.count).toBe(1);
    // idempotent
    const again = await svc.recomputeStreaks(week);
    expect(again.find((s) => s.goalId === "aws")?.count).toBe(1);
  });

  it("round-trips an in-progress review, which Lambda cannot keep in memory", async () => {
    const chatId = 4242;
    expect(await repo.getPendingReview(chatId)).toBeUndefined();

    await repo.putPendingReview({ chatId, week: 99, answers: [] });
    await repo.putPendingReview({ chatId, week: 99, answers: ["shipped a thing"] });

    const pending = await repo.getPendingReview(chatId);
    expect(pending).toEqual({ chatId, week: 99, answers: ["shipped a thing"] });

    await repo.clearPendingReview(chatId);
    expect(await repo.getPendingReview(chatId)).toBeUndefined();
  });

  it("parks ideas", async () => {
    await repo.addParked("voice mode");
    const parked = await repo.listParked();
    expect(parked.some((p) => p.text === "voice mode")).toBe(true);
  });
});
