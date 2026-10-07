import { MAX_EXAMPLE_CHARS } from "@/lib/overview/first-screen-examples";
import type { WorkMode } from "@/lib/chat/work-modes";

/**
 * THE FIRST TASK (MASTER 10: «ο νέος χρήστης ολοκληρώνει μία πραγματική
 * εργασία στα πρώτα 5 λεπτά»; MASTER 16, package 39), behind the switch
 * "first-task".
 *
 * The questionnaire a new account met first asked what it mostly wanted
 * to keep on top of — trading, freelance, a startup, an agency — and
 * then for a spreadsheet. Nothing in it was a task, and none of its
 * answers changed what the product did next. These three ARE tasks: one
 * press each, the answer on screen in seconds.
 *
 * EVERY ONE FINISHES ON THE FREE PLAN. Each opens Chat with the task
 * already sent (app/dashboard/chat/page.tsx reads `ask` and `mode`
 * through readExampleParam and readWorkMode), and Chat is the one tool
 * every plan has (lib/billing/feature-catalog.ts, aiChat: minPlan
 * "free"), free while the month's free messages last. The Home's own
 * examples (lib/overview/first-screen-examples.ts) land in the Site and
 * the Agents, both Starter: a new Free account pressing them meets a
 * wall, which is the opposite of a first task.
 *
 * One per way of working, so the three teach three different things:
 * something written, something planned, something explained.
 *
 * Client-safe and pure. Held by scripts/tests/first-task.test.mjs.
 */
export type FirstTaskId = "write" | "plan" | "explain";

export type FirstTask = {
  id: FirstTaskId;
  /** The way of working Chat answers in (lib/chat/work-modes.ts). */
  mode: WorkMode;
};

export const FIRST_TASKS: readonly FirstTask[] = [
  { id: "write", mode: "create" },
  { id: "plan", mode: "run" },
  { id: "explain", mode: "research" },
];

/** What a press on a task records as the account's goal: which task it began with. */
export const FIRST_TASK_GOAL_PREFIX = "first-task:";

export function goalFor(id: FirstTaskId | "own"): string {
  return `${FIRST_TASK_GOAL_PREFIX}${id}`;
}

/**
 * Where a task, or the person's own sentence, is answered: Chat, with the
 * text already sent. The text is clamped here, to the same ceiling the
 * page clamps it to on arrival.
 */
export function firstTaskHref(text: string, mode: WorkMode | null): string {
  const ask = encodeURIComponent(text.trim().slice(0, MAX_EXAMPLE_CHARS));
  return mode ? `/dashboard/chat?mode=${mode}&ask=${ask}` : `/dashboard/chat?ask=${ask}`;
}
