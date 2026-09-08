/**
 * Turns a Discord interaction into a response. Pure dispatch: everything it
 * needs is in src/domain and src/db, which know nothing about Discord.
 *
 * Replies must be sent within 3 seconds, so every handler here is one or two
 * DynamoDB round trips and no more.
 */
import * as repo from "../db/repo.js";
import * as fmt from "../domain/format.js";
import { GOAL_IDS, isGoalId, slotFor } from "../domain/rotation.js";
import * as svc from "../service.js";
import { config } from "../config.js";
import { log } from "../logger.js";
import {
  ComponentType,
  EPHEMERAL,
  InteractionResponseType,
  InteractionType,
  TextInputStyle,
  intOption,
  modalValues,
  stringOption,
  userIdOf,
  type Interaction,
  type InteractionResponse,
} from "./types.js";

const REVIEW_MODAL = "review";

function reply(content: string, ephemeral = false): InteractionResponse {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, ...(ephemeral ? { flags: EPHEMERAL } : {}) },
  };
}

/** Preformatted blocks keep the scorecard's alignment intact in Discord. */
function replyBlock(content: string): InteractionResponse {
  return reply(`\`\`\`\n${content}\n\`\`\``);
}

async function pickTask(week: number, n: number | undefined, preferGoal: string | null): Promise<{ task?: repo.Task; error?: string }> {
  const { tasks } = await repo.getWeek(week);
  if (n !== undefined) {
    const t = tasks[n - 1];
    return t ? { task: t } : { error: `No task #${n}. See /week.` };
  }
  const t = tasks.find((x) => x.status === "todo" && x.goalId === preferGoal) ?? tasks.find((x) => x.status === "todo");
  return t ? { task: t } : { error: "No open tasks this week. Add one with /add." };
}

async function handleCommand(interaction: Interaction): Promise<InteractionResponse> {
  const name = interaction.data?.name;
  const { day, week, dayN } = svc.now();
  const slot = slotFor(day.weekday);

  switch (name) {
    case "help":
      return reply(fmt.HELP, true);

    case "today": {
      const { todayText } = await import("../jobs.js");
      return reply(await todayText());
    }

    case "goals":
      return reply(fmt.goalsMessage(await repo.listGoals()), true);

    case "log": {
      const minutes = intOption(interaction, "minutes");
      const note = stringOption(interaction, "note")?.trim();
      const goalId = stringOption(interaction, "goal") ?? slot.goalId;
      if (!minutes || !note) return reply("Usage: /log minutes:<n> note:<what you did>", true);
      if (!goalId) return reply(`Sunday has no slot, so pick one: /log minutes:${minutes} note:… goal:<${GOAL_IDS.join("|")}>`, true);
      if (!isGoalId(goalId)) return reply(`Unknown goal ${goalId}.`, true);

      await repo.addLog(week, day.date, goalId, minutes, note);
      const data = await repo.getWeek(week);
      const todayTotal = data.logs.filter((l) => l.date === day.date).reduce((a, l) => a + l.minutes, 0);
      const learned = data.learned.some((l) => l.date === day.date);
      return reply(
        `Logged ${minutes}m on ${goalId}. Today: ${fmt.fmtMinutes(todayTotal)}.` + (learned ? "" : "\nNow `/learned` — one line. It's tomorrow's post."),
      );
    }

    case "learned": {
      const text = stringOption(interaction, "text")?.trim();
      if (!text) return reply("Usage: /learned text:<one line>", true);
      await repo.setLearned(week, day.date, text);
      return reply("Saved. `/post` gives you today's draft.");
    }

    case "done": {
      const { task, error } = await pickTask(week, intOption(interaction, "n"), slot.goalId);
      if (!task) return reply(error ?? "No task.", true);
      if (task.status === "done") return reply(`Already done: ${task.title}`, true);
      await repo.setTaskStatus(task, "done");
      return reply(`✅ ${task.title}\n\nLog the time if you haven't: /log`);
    }

    case "skip": {
      const reason = stringOption(interaction, "reason")?.trim();
      if (!reason) return reply("Usage: /skip reason:<why>", true);
      const { task, error } = await pickTask(week, intOption(interaction, "n"), slot.goalId);
      if (!task) return reply(error ?? "No task.", true);
      await repo.setTaskStatus(task, "skipped", reason);
      return reply(`⏭ ${task.title}\nReason on record: ${reason}`);
    }

    case "week": {
      const [{ tasks }, goals] = await Promise.all([repo.getWeek(week), svc.goalsById()]);
      return reply(fmt.weekMessage(week, tasks, goals));
    }

    case "add": {
      const title = stringOption(interaction, "task")?.trim();
      const goalId = stringOption(interaction, "goal") ?? slot.goalId;
      if (!title) return reply("Usage: /add task:<what to do>", true);
      if (!goalId) return reply(`Sunday has no slot, so pick one: /add task:… goal:<${GOAL_IDS.join("|")}>`, true);
      if (!isGoalId(goalId)) return reply(`Unknown goal ${goalId}.`, true);

      // Tasks added during the Sunday review belong to next week.
      const targetWeek = day.weekday === 0 ? week + 1 : week;
      const task = await repo.addTask(targetWeek, goalId, title);
      return reply(`Added to week ${targetWeek} [${goalId}]: ${task.title}`);
    }

    case "score":
      return replyBlock(fmt.scoreMessage(await svc.getScore(week)));

    case "review":
      return reviewModal(week);

    case "post": {
      const scope = stringOption(interaction, "scope") ?? "day";
      if (scope === "week") {
        const [score, data] = await Promise.all([svc.getScore(week), repo.getWeek(week)]);
        return reply(fmt.weeklyPostDraft(score, data.review));
      }
      const data = await repo.getWeek(week);
      return reply(
        fmt.dailyPostDraft({
          dayN,
          date: day.date,
          logs: data.logs.filter((l) => l.date === day.date),
          learned: data.learned.find((l) => l.date === day.date),
        }),
      );
    }

    case "park": {
      const idea = stringOption(interaction, "idea")?.trim();
      if (!idea) return reply("Usage: /park idea:<the idea>", true);
      await repo.addParked(idea);
      return reply("Parked. It'll be there on Sunday. Back to today's task.");
    }

    case "parked": {
      const items = await repo.listParked();
      if (items.length === 0) return reply("Nothing parked.", true);
      return reply(`**Parked ideas**\n${items.map((p, i) => `${i + 1}. ${p.text} (${p.createdAt.slice(0, 10)})`).join("\n")}`, true);
    }

    default:
      return reply(`Unknown command ${name ?? "(none)"}. Try /help.`, true);
  }
}

function reviewModal(week: number): InteractionResponse {
  const field = (id: string, label: string, placeholder: string) => ({
    type: ComponentType.ACTION_ROW,
    components: [
      {
        type: ComponentType.TEXT_INPUT,
        custom_id: id,
        label,
        style: TextInputStyle.PARAGRAPH,
        required: true,
        max_length: 500,
        placeholder,
      },
    ],
  });

  return {
    type: InteractionResponseType.MODAL,
    data: {
      custom_id: `${REVIEW_MODAL}:${week}`,
      title: `Week ${week} review`,
      components: [
        field("shipped", "What shipped this week?", "One or two lines."),
        field("slipped", "What slipped, and why?", "Be specific. This is the useful one."),
        field("lesson", "One lesson for last-Monday you", "The thing you'd say if you could go back."),
      ],
    },
  };
}

async function handleModal(interaction: Interaction): Promise<InteractionResponse> {
  const customId = interaction.data?.custom_id ?? "";
  if (!customId.startsWith(`${REVIEW_MODAL}:`)) return reply("Unknown form.", true);

  const week = Number(customId.slice(REVIEW_MODAL.length + 1));
  if (!Number.isInteger(week)) return reply("That form had a bad week number.", true);

  const values = modalValues(interaction);
  const review: repo.Review = {
    week,
    shipped: values.shipped ?? "",
    slipped: values.slipped ?? "",
    lesson: values.lesson ?? "",
    createdAt: new Date().toISOString(),
  };

  await repo.putReview(review);
  await svc.recomputeStreaks(week);
  const score = await svc.getScore(week);

  return reply(
    `Review saved for week ${week}. Here's the weekly draft:\n\n${fmt.weeklyPostDraft(score, review)}\n\nNow set next week's tasks with /add — five to seven of them.`,
  );
}

/** Entry point: an already-verified, already-parsed interaction in, a response out. */
export async function handleInteraction(interaction: Interaction): Promise<InteractionResponse> {
  if (interaction.type === InteractionType.PING) {
    return { type: InteractionResponseType.PONG };
  }

  const userId = userIdOf(interaction);
  if (!config.OWNER_USER_ID) {
    return reply(`I don't know who my owner is yet.\n\nSet \`OWNER_USER_ID=${userId ?? "?"}\` and redeploy.`, true);
  }
  if (userId !== config.OWNER_USER_ID) {
    log.warn({ userId }, "ignoring interaction from non-owner");
    return reply("This one's not for you — it's someone's personal accountability bot.", true);
  }

  try {
    if (interaction.type === InteractionType.APPLICATION_COMMAND) return await handleCommand(interaction);
    if (interaction.type === InteractionType.MODAL_SUBMIT) return await handleModal(interaction);
  } catch (err) {
    log.error({ err, type: interaction.type, name: interaction.data?.name }, "interaction failed");
    return reply("That broke. The error is in CloudWatch.", true);
  }

  return reply("Unsupported interaction type.", true);
}
