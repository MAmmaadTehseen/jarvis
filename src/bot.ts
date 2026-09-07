import { Bot, type Context, type NextFunction } from "grammy";
import { config } from "./config.js";
import * as repo from "./db/repo.js";
import * as svc from "./service.js";
import * as fmt from "./domain/format.js";
import { isGoalId, slotFor, GOAL_IDS } from "./domain/rotation.js";
import { log } from "./logger.js";

export const COMMANDS = [
  { command: "today", description: "Today's slot and task" },
  { command: "log", description: "/log <minutes> [goal] <note>" },
  { command: "learned", description: "/learned <one line you learned today>" },
  { command: "done", description: "/done [n]  mark a task done" },
  { command: "skip", description: "/skip [n] <reason>" },
  { command: "week", description: "This week's tasks" },
  { command: "add", description: "/add [goal] <task>" },
  { command: "score", description: "This week's scorecard" },
  { command: "review", description: "Sunday review, 3 questions" },
  { command: "post", description: "/post or /post week: LinkedIn draft" },
  { command: "park", description: "/park <idea> for later" },
  { command: "parked", description: "List parked ideas" },
  { command: "goals", description: "Goals and weekly targets" },
  { command: "help", description: "How this works" },
];

interface PendingReview {
  week: number;
  answers: string[];
}
const pendingReview = new Map<number, PendingReview>();

/** Kick off the 3-question review for a chat. Used by /review and the Sunday job. */
export async function startReview(bot: Bot, chatId: number, week: number): Promise<void> {
  pendingReview.set(chatId, { week, answers: [] });
  await bot.api.sendMessage(chatId, `Week ${week} review. Three questions, reply to each in one message.\n\n${fmt.REVIEW_QUESTIONS[0]}`);
}

async function ownerGuard(ctx: Context, next: NextFunction): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return;
  if (!config.OWNER_CHAT_ID) {
    await ctx.reply(`Hi. I don't know who my owner is yet.\n\nPut this in .env and restart:\nOWNER_CHAT_ID=${chatId}`);
    return;
  }
  if (String(chatId) !== config.OWNER_CHAT_ID) {
    log.warn({ chatId }, "ignoring message from non-owner");
    return;
  }
  await next();
}

/** "/cmd 3 rest of text" -> { n: 3, rest: "rest of text" }; "/cmd text" -> { rest: "text" } */
function parseIndexed(match: string): { n?: number; rest: string } {
  const m = match.trim().match(/^(\d{1,3})(?:\s+(.*))?$/s);
  if (m) return { n: Number(m[1]), rest: (m[2] ?? "").trim() };
  return { rest: match.trim() };
}

function matchText(ctx: Context): string {
  return typeof ctx.match === "string" ? ctx.match : "";
}

async function pickTask(week: number, n: number | undefined, preferGoal: string | null): Promise<{ task?: repo.Task; error?: string }> {
  const { tasks } = await repo.getWeek(week);
  if (n !== undefined) {
    const t = tasks[n - 1];
    return t ? { task: t } : { error: `No task #${n}. See /week.` };
  }
  const t = tasks.find((x) => x.status === "todo" && x.goalId === preferGoal) ?? tasks.find((x) => x.status === "todo");
  return t ? { task: t } : { error: "No open tasks this week. Add one with /add <goal> <task>." };
}

export function createBot(): Bot {
  const bot = new Bot(config.BOT_TOKEN);
  bot.use(ownerGuard);

  bot.command(["start", "help"], (ctx) => ctx.reply(fmt.HELP));

  bot.command("today", async (ctx) => {
    const { todayText } = await import("./jobs.js");
    await ctx.reply(await todayText());
  });

  bot.command("goals", async (ctx) => ctx.reply(fmt.goalsMessage(await repo.listGoals())));

  bot.command("log", async (ctx) => {
    const { day, week } = svc.now();
    const tokens = matchText(ctx).split(/\s+/).filter(Boolean);
    const minutes = Number(tokens[0]);
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 600) {
      return ctx.reply("Usage: /log <minutes> [goal] <note>\nExample: /log 45 wrote the Terraform for DynamoDB");
    }
    let goalId: string | null = slotFor(day.weekday).goalId;
    let noteStart = 1;
    if (isGoalId(tokens[1])) {
      goalId = tokens[1];
      noteStart = 2;
    }
    if (!goalId) return ctx.reply(`Sunday has no slot. Say which goal: /log ${minutes} <${GOAL_IDS.join("|")}> <note>`);
    const note = tokens.slice(noteStart).join(" ");
    if (!note) return ctx.reply("Add a note so the post has something to say: /log 45 what you did");
    await repo.addLog(week, day.date, goalId, minutes, note);
    const data = await repo.getWeek(week);
    const todayTotal = data.logs.filter((l) => l.date === day.date).reduce((a, l) => a + l.minutes, 0);
    const learned = data.learned.some((l) => l.date === day.date);
    await ctx.reply(`Logged ${minutes}m on ${goalId}. Today: ${fmt.fmtMinutes(todayTotal)}.${learned ? "" : " Now /learned <one line>."}`);
  });

  bot.command("learned", async (ctx) => {
    const text = matchText(ctx).trim();
    if (!text) return ctx.reply("Usage: /learned <one line you learned today>");
    const { day, week } = svc.now();
    await repo.setLearned(week, day.date, text);
    await ctx.reply("Saved. /post gives you today's draft.");
  });

  bot.command("done", async (ctx) => {
    const { day, week } = svc.now();
    const { n } = parseIndexed(matchText(ctx));
    const { task, error } = await pickTask(week, n, slotFor(day.weekday).goalId);
    if (!task) return ctx.reply(error ?? "No task.");
    if (task.status === "done") return ctx.reply(`Already done: ${task.title}`);
    await repo.setTaskStatus(task, "done");
    await ctx.reply(`✅ ${task.title}\n\nLog the time if you haven't: /log <minutes> <note>`);
  });

  bot.command("skip", async (ctx) => {
    const { day, week } = svc.now();
    const { n, rest } = parseIndexed(matchText(ctx));
    if (!rest) return ctx.reply("Usage: /skip [n] <reason>. The reason is the point.");
    const { task, error } = await pickTask(week, n, slotFor(day.weekday).goalId);
    if (!task) return ctx.reply(error ?? "No task.");
    await repo.setTaskStatus(task, "skipped", rest);
    await ctx.reply(`⏭ ${task.title}\nReason on record: ${rest}`);
  });

  bot.command("week", async (ctx) => {
    const { week } = svc.now();
    const [{ tasks }, goals] = await Promise.all([repo.getWeek(week), svc.goalsById()]);
    await ctx.reply(fmt.weekMessage(week, tasks, goals));
  });

  bot.command("add", async (ctx) => {
    const { day, week } = svc.now();
    const tokens = matchText(ctx).split(/\s+/).filter(Boolean);
    let goalId: string | null = slotFor(day.weekday).goalId;
    let titleStart = 0;
    if (isGoalId(tokens[0])) {
      goalId = tokens[0];
      titleStart = 1;
    }
    const title = tokens.slice(titleStart).join(" ");
    if (!title) return ctx.reply(`Usage: /add [${GOAL_IDS.join("|")}] <task>`);
    if (!goalId) return ctx.reply(`Sunday has no slot. Say which goal: /add <${GOAL_IDS.join("|")}> <task>`);
    // Sunday: tasks added during review belong to next week
    const targetWeek = day.weekday === 0 ? week + 1 : week;
    const task = await repo.addTask(targetWeek, goalId, title);
    await ctx.reply(`Added to week ${targetWeek} [${goalId}]: ${task.title}`);
  });

  bot.command("score", async (ctx) => {
    const { week } = svc.now();
    const score = await svc.getScore(week);
    await ctx.reply(`<pre>${fmt.escapeHtml(fmt.scoreMessage(score))}</pre>`, { parse_mode: "HTML" });
  });

  bot.command("review", async (ctx) => {
    const { week } = svc.now();
    await startReview(bot, ctx.chat.id, week);
  });

  bot.command("post", async (ctx) => {
    const { day, week, dayN } = svc.now();
    const arg = matchText(ctx).trim().toLowerCase();
    if (arg === "week") {
      const [score, data] = await Promise.all([svc.getScore(week), repo.getWeek(week)]);
      return ctx.reply(fmt.weeklyPostDraft(score, data.review));
    }
    const data = await repo.getWeek(week);
    const logs = data.logs.filter((l) => l.date === day.date);
    const learned = data.learned.find((l) => l.date === day.date);
    await ctx.reply(fmt.dailyPostDraft({ dayN, date: day.date, logs, learned }));
  });

  bot.command("park", async (ctx) => {
    const text = matchText(ctx).trim();
    if (!text) return ctx.reply("Usage: /park <idea>");
    await repo.addParked(text);
    await ctx.reply("Parked. It'll be there on Sunday. Back to today's task.");
  });

  bot.command("parked", async (ctx) => {
    const items = await repo.listParked();
    if (items.length === 0) return ctx.reply("Nothing parked.");
    await ctx.reply(`Parked ideas\n\n${items.map((p, i) => `${i + 1}. ${p.text} (${p.createdAt.slice(0, 10)})`).join("\n")}`);
  });

  // Plain text: only meaningful while a review is in progress.
  bot.on("message:text", async (ctx) => {
    const pending = pendingReview.get(ctx.chat.id);
    if (!pending) return ctx.reply("Not sure what to do with that. /help lists the commands.");
    pending.answers.push(ctx.message.text.trim());
    const next = fmt.REVIEW_QUESTIONS[pending.answers.length];
    if (next) return ctx.reply(next);

    pendingReview.delete(ctx.chat.id);
    const [shipped = "", slipped = "", lesson = ""] = pending.answers;
    const review: repo.Review = { week: pending.week, shipped, slipped, lesson, createdAt: new Date().toISOString() };
    await repo.putReview(review);
    await svc.recomputeStreaks(pending.week);
    const score = await svc.getScore(pending.week);
    await ctx.reply(`Review saved for week ${pending.week}. Here's the weekly post draft:\n\n${fmt.weeklyPostDraft(score, review)}`);
    await ctx.reply("Now set next week's tasks: /add <goal> <task>, 5 to 7 of them.");
  });

  bot.catch((err) => {
    log.error({ err: err.error, update: err.ctx.update.update_id }, "bot error");
  });

  return bot;
}
