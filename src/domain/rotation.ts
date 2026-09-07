import type { Weekday } from "./time.js";

export interface GoalSeed {
  goalId: string;
  name: string;
  weeklyMinutesTarget: number;
  order: number;
}

/** The five goals. Practice projects + real projects are both "jarvis". */
export const GOAL_SEEDS: GoalSeed[] = [
  { goalId: "jarvis", name: "Jarvis", weeklyMinutesTarget: 180, order: 1 },
  { goalId: "aws", name: "AWS", weeklyMinutesTarget: 60, order: 2 },
  { goalId: "devops", name: "DevOps", weeklyMinutesTarget: 60, order: 3 },
  { goalId: "freelance", name: "Freelance", weeklyMinutesTarget: 60, order: 4 },
  { goalId: "content", name: "Content", weeklyMinutesTarget: 30, order: 5 },
];

export const GOAL_IDS = GOAL_SEEDS.map((g) => g.goalId);
export function isGoalId(s: string | undefined): s is string {
  return !!s && GOAL_IDS.includes(s);
}

export interface Slot {
  goalId: string | null;
  label: string;
  minutes: number;
  hint: string;
}

/** Every weekday has one owner. Sunday is the review. */
export const ROTATION: Record<Weekday, Slot> = {
  0: { goalId: null, label: "Weekly review", minutes: 15, hint: "Run /review (3 questions), then /add next week's tasks." },
  1: { goalId: "jarvis", label: "Jarvis build", minutes: 90, hint: "Ship the next feature on the roadmap." },
  2: { goalId: "aws", label: "AWS", minutes: 60, hint: "Learn exactly what Jarvis needs next, then apply it to Jarvis." },
  3: { goalId: "jarvis", label: "Jarvis build", minutes: 90, hint: "Ship the next feature on the roadmap." },
  4: { goalId: "devops", label: "DevOps", minutes: 60, hint: "Learn it, apply it to Jarvis. Docker, CI/CD, Terraform." },
  5: { goalId: "freelance", label: "Freelancing", minutes: 60, hint: "Profile, proposals, one outreach." },
  6: { goalId: "content", label: "Content", minutes: 30, hint: "Post the weekly scorecard + devlog." },
};

export function slotFor(weekday: Weekday): Slot {
  return ROTATION[weekday];
}
