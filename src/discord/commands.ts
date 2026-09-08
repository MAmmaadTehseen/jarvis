/** Slash command definitions, registered with `npm run register`. */
import { GOAL_SEEDS } from "../domain/rotation.js";
import { OptionType } from "./types.js";

const goalChoices = GOAL_SEEDS.map((g) => ({ name: g.name, value: g.goalId }));

const goalOption = {
  name: "goal",
  description: "Which goal. Defaults to today's slot.",
  type: OptionType.STRING,
  required: false,
  choices: goalChoices,
};

const taskNumberOption = {
  name: "n",
  description: "Task number from /week. Defaults to today's first open task.",
  type: OptionType.INTEGER,
  required: false,
  min_value: 1,
};

export const COMMANDS = [
  { name: "today", description: "Today's slot, task, and minutes logged so far" },
  {
    name: "log",
    description: "Record time spent",
    options: [
      { name: "minutes", description: "How many minutes", type: OptionType.INTEGER, required: true, min_value: 1, max_value: 600 },
      { name: "note", description: "What you actually did", type: OptionType.STRING, required: true },
      goalOption,
    ],
  },
  {
    name: "learned",
    description: "One line you learned today. This becomes the post.",
    options: [{ name: "text", description: "The one line", type: OptionType.STRING, required: true }],
  },
  { name: "done", description: "Mark a task done", options: [taskNumberOption] },
  {
    name: "skip",
    description: "Skip a task, on the record",
    options: [
      { name: "reason", description: "Why. The reason is the point.", type: OptionType.STRING, required: true },
      taskNumberOption,
    ],
  },
  { name: "week", description: "This week's tasks" },
  {
    name: "add",
    description: "Add a task for this week (next week if it's Sunday)",
    options: [
      { name: "task", description: "Small enough to finish in one slot", type: OptionType.STRING, required: true },
      goalOption,
    ],
  },
  { name: "score", description: "This week's scorecard: minutes vs target, tasks, streaks" },
  { name: "review", description: "The Sunday review: three questions in one form" },
  {
    name: "post",
    description: "A LinkedIn draft built from what you logged",
    options: [
      {
        name: "scope",
        description: "Today's post or this week's",
        type: OptionType.STRING,
        required: false,
        choices: [
          { name: "today", value: "day" },
          { name: "week", value: "week" },
        ],
      },
    ],
  },
  {
    name: "park",
    description: "Park an idea until Sunday, so it stops competing with today",
    options: [{ name: "idea", description: "The idea", type: OptionType.STRING, required: true }],
  },
  { name: "parked", description: "List parked ideas" },
  { name: "goals", description: "Goals and weekly targets" },
  { name: "help", description: "How this works" },
];

export const COMMAND_NAMES = COMMANDS.map((c) => c.name);
