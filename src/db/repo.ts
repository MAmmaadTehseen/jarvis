/**
 * Single-table DynamoDB layout. One partition per week holds everything that
 * happened that week, so /score and /week are one query each.
 *
 *   pk            sk                          item
 *   GOALS         GOAL#<goalId>               Goal
 *   WEEK#<n>      TASK#<createdAt>#<taskId>   Task
 *   WEEK#<n>      LOG#<date>#<createdAt>      LogEntry
 *   WEEK#<n>      LEARNED#<date>              Learned
 *   WEEK#<n>      REVIEW                      Review
 *   STREAKS       STREAK#<goalId>             Streak
 *   PARKED        PARK#<createdAt>            Parked
 *   STATE         REVIEW#<chatId>             PendingReview
 */
import { randomUUID } from "node:crypto";
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { config } from "../config.js";
import type { GoalSeed } from "../domain/rotation.js";
import { doc } from "./client.js";

const TableName = config.TABLE_NAME;

export type TaskStatus = "todo" | "done" | "skipped";

export interface Goal {
  goalId: string;
  name: string;
  weeklyMinutesTarget: number;
  order: number;
  active: boolean;
}
export interface Task {
  pk: string;
  sk: string;
  taskId: string;
  week: number;
  goalId: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  doneAt?: string;
  skipReason?: string;
}
export interface LogEntry {
  date: string;
  week: number;
  goalId: string;
  minutes: number;
  note: string;
  createdAt: string;
}
export interface Learned {
  date: string;
  week: number;
  text: string;
}
export interface Review {
  week: number;
  shipped: string;
  slipped: string;
  lesson: string;
  createdAt: string;
}
export interface Streak {
  goalId: string;
  count: number;
  lastWeek: number;
}
export interface Parked {
  text: string;
  createdAt: string;
}
/** A review in progress. Persisted because Lambda keeps no memory between invocations. */
export interface PendingReview {
  chatId: number;
  week: number;
  answers: string[];
}
export interface WeekData {
  tasks: Task[];
  logs: LogEntry[];
  learned: Learned[];
  review?: Review;
}

const K = {
  goals: "GOALS",
  goal: (id: string) => `GOAL#${id}`,
  week: (n: number) => `WEEK#${n}`,
  task: (createdAt: string, id: string) => `TASK#${createdAt}#${id}`,
  log: (date: string, createdAt: string) => `LOG#${date}#${createdAt}`,
  learned: (date: string) => `LEARNED#${date}`,
  review: "REVIEW",
  streaks: "STREAKS",
  streak: (id: string) => `STREAK#${id}`,
  parked: "PARKED",
  park: (createdAt: string) => `PARK#${createdAt}`,
  state: "STATE",
  pendingReview: (chatId: number) => `REVIEW#${chatId}`,
};

type Item = Record<string, unknown>;

async function query(pk: string, skPrefix?: string): Promise<Item[]> {
  const items: Item[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const out = await doc.send(
      new QueryCommand({
        TableName,
        KeyConditionExpression: skPrefix ? "pk = :pk AND begins_with(sk, :sk)" : "pk = :pk",
        ExpressionAttributeValues: skPrefix ? { ":pk": pk, ":sk": skPrefix } : { ":pk": pk },
        ExclusiveStartKey,
      }),
    );
    items.push(...((out.Items ?? []) as Item[]));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

function id(): string {
  return randomUUID().slice(0, 8);
}
function nowIso(): string {
  return new Date().toISOString();
}

// Goals

export async function ensureGoals(seeds: GoalSeed[]): Promise<void> {
  for (const s of seeds) {
    const existing = await doc.send(new GetCommand({ TableName, Key: { pk: K.goals, sk: K.goal(s.goalId) } }));
    if (existing.Item) continue;
    const goal: Goal = { ...s, active: true };
    await doc.send(new PutCommand({ TableName, Item: { pk: K.goals, sk: K.goal(s.goalId), ...goal } }));
  }
}

export async function listGoals(): Promise<Goal[]> {
  const items = await query(K.goals, "GOAL#");
  return items.map((i) => ({
    goalId: i.goalId as string,
    name: i.name as string,
    weeklyMinutesTarget: i.weeklyMinutesTarget as number,
    order: (i.order as number) ?? 99,
    active: (i.active as boolean) ?? true,
  }));
}

// Week partition

export async function getWeek(week: number): Promise<WeekData> {
  const items = await query(K.week(week));
  const data: WeekData = { tasks: [], logs: [], learned: [] };
  for (const i of items) {
    const sk = i.sk as string;
    if (sk.startsWith("TASK#")) data.tasks.push(i as unknown as Task);
    else if (sk.startsWith("LOG#")) data.logs.push(i as unknown as LogEntry);
    else if (sk.startsWith("LEARNED#")) data.learned.push(i as unknown as Learned);
    else if (sk === K.review) data.review = i as unknown as Review;
  }
  return data;
}

export async function addTask(week: number, goalId: string, title: string): Promise<Task> {
  const createdAt = nowIso();
  const taskId = id();
  const task: Task = { pk: K.week(week), sk: K.task(createdAt, taskId), taskId, week, goalId, title, status: "todo", createdAt };
  await doc.send(new PutCommand({ TableName, Item: task }));
  return task;
}

export async function setTaskStatus(task: Task, status: TaskStatus, skipReason?: string): Promise<Task> {
  const doneAt = status === "done" ? nowIso() : undefined;
  await doc.send(
    new UpdateCommand({
      TableName,
      Key: { pk: task.pk, sk: task.sk },
      UpdateExpression: "SET #s = :s, doneAt = :d, skipReason = :r",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":s": status, ":d": doneAt ?? null, ":r": skipReason ?? null },
    }),
  );
  return { ...task, status, doneAt, skipReason };
}

export async function addLog(week: number, date: string, goalId: string, minutes: number, note: string): Promise<LogEntry> {
  const createdAt = nowIso();
  const entry: LogEntry = { date, week, goalId, minutes, note, createdAt };
  await doc.send(new PutCommand({ TableName, Item: { pk: K.week(week), sk: K.log(date, createdAt), ...entry } }));
  return entry;
}

export async function setLearned(week: number, date: string, text: string): Promise<Learned> {
  const learned: Learned = { date, week, text };
  await doc.send(new PutCommand({ TableName, Item: { pk: K.week(week), sk: K.learned(date), ...learned } }));
  return learned;
}

export async function putReview(review: Review): Promise<void> {
  await doc.send(new PutCommand({ TableName, Item: { pk: K.week(review.week), sk: K.review, ...review } }));
}

// Streaks

export async function listStreaks(): Promise<Streak[]> {
  const items = await query(K.streaks, "STREAK#");
  return items.map((i) => ({ goalId: i.goalId as string, count: i.count as number, lastWeek: i.lastWeek as number }));
}

export async function putStreak(streak: Streak): Promise<void> {
  await doc.send(new PutCommand({ TableName, Item: { pk: K.streaks, sk: K.streak(streak.goalId), ...streak } }));
}

// Parked ideas

export async function addParked(text: string): Promise<Parked> {
  const createdAt = nowIso();
  await doc.send(new PutCommand({ TableName, Item: { pk: K.parked, sk: K.park(createdAt), text, createdAt } }));
  return { text, createdAt };
}

export async function listParked(): Promise<Parked[]> {
  const items = await query(K.parked, "PARK#");
  return items.map((i) => ({ text: i.text as string, createdAt: i.createdAt as string }));
}

// In-progress review

export async function getPendingReview(chatId: number): Promise<PendingReview | undefined> {
  const out = await doc.send(new GetCommand({ TableName, Key: { pk: K.state, sk: K.pendingReview(chatId) } }));
  if (!out.Item) return undefined;
  return { chatId, week: out.Item.week as number, answers: (out.Item.answers as string[]) ?? [] };
}

export async function putPendingReview(pending: PendingReview): Promise<void> {
  await doc.send(
    new PutCommand({
      TableName,
      Item: { pk: K.state, sk: K.pendingReview(pending.chatId), ...pending },
    }),
  );
}

export async function clearPendingReview(chatId: number): Promise<void> {
  await doc.send(new DeleteCommand({ TableName, Key: { pk: K.state, sk: K.pendingReview(chatId) } }));
}
