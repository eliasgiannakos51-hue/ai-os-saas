#!/usr/bin/env node
/*
 * CAN first-task.test.mjs SEE A FIRST SCREEN THAT LEAVES A NEW ACCOUNT
 * STUCK, WALLED OR SENT BACK?
 *
 * A task that lands on a tool the Free plan does not have; Chat no longer
 * sending what it was handed; a press that leaves before it records, or
 * records nothing, so Home sends the person back; a press that stays put
 * when the record fails; two presses, two answers; the questionnaire gone;
 * an account that finished meeting it again; the switch not deciding it;
 * and, on the way there, English on a Greek screen: the sign-in splash,
 * and Chat's out-of-credits refusal.
 *
 * Run: node scripts/tests/first-task.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/first-task.test.mjs";
const LIB = "src/lib/onboarding/first-tasks.ts";
const SCREEN = "src/components/onboarding/first-task.tsx";
const PAGE = "src/app/onboarding/page.tsx";
const CHAT = "src/app/dashboard/chat/page.tsx";
const SPLASH = "src/components/auth/login-splash.tsx";
const CHAT_ROUTE = "src/app/api/chat/route.ts";
const CHAT_SCREEN = "src/components/chat/chat-workspace.tsx";

const MUTANTS = [
  {
    name: "a first task lands on a tool the Free plan does not have",
    file: LIB,
    from: "  return mode ? `/dashboard/chat?mode=${mode}&ask=${ask}` : `/dashboard/chat?ask=${ask}`;",
    to: "  return mode ? `/dashboard/website-builder?mode=${mode}&brief=${ask}` : `/dashboard/chat?ask=${ask}`;",
    expect: "a task opens Chat with the task already in it, and its way of working",
  },
  {
    name: "the task is not clamped to what the page reads",
    file: LIB,
    from: "  const ask = encodeURIComponent(text.trim().slice(0, MAX_EXAMPLE_CHARS));",
    to: "  const ask = encodeURIComponent(text.trim());",
    expect: "...clamped to what the page reads",
  },
  {
    name: "two tasks answered the same way",
    file: LIB,
    from: '  { id: "plan", mode: "run" },',
    to: '  { id: "plan", mode: "create" },',
    expect: "three tasks, three different ways of working",
  },
  {
    name: "Chat forgets its way of working",
    file: CHAT,
    from: "        initialWorkMode={readWorkMode(searchParams.mode) ?? undefined}",
    to: "        initialWorkMode={undefined}",
    expect: "...and reads its way of working",
  },
  {
    name: "a press records nothing, so Home sends the person back",
    file: SCREEN,
    from: "        body: JSON.stringify({ completed: true, goal }),",
    to: "        body: JSON.stringify({ goal }),",
    expect: "a press records completion and what began it, BEFORE it leaves",
  },
  {
    name: "a press stays put when the record could not be kept",
    file: SCREEN,
    from: "    } catch {\n      // The task matters more than the record of it: a lost record only\n      // means this screen is offered once more, from Home.\n    }\n    router.push(href);",
    to: "      router.push(href);\n    } catch {\n      // The task matters more than the record of it: a lost record only\n      // means this screen is offered once more, from Home.\n    }",
    expect: "...and leaves even when the record could not be kept",
  },
  {
    name: "two presses send the task twice",
    file: SCREEN,
    from: "  async function begin(key: string, goal: string, href: string) {\n    if (busy) return;\n",
    to: "  async function begin(key: string, goal: string, href: string) {\n",
    expect: "...once: a second press while it leaves does nothing",
  },
  {
    name: "the data import is no longer reachable",
    file: SCREEN,
    from: 'href="/onboarding?classic=1"',
    to: 'href="/dashboard/overview"',
    expect: "the data import is one press away",
  },
  {
    name: "an account that finished meets it again",
    file: PAGE,
    from: "  if (!stateError && (state?.completed_at || state?.skipped_at)) {\n    redirect(\"/dashboard/overview\");\n  }\n",
    to: "",
    expect: "an account that finished or skipped never meets it",
  },
  {
    name: "the questionnaire is gone for everyone",
    file: PAGE,
    from: '  if ((await isFeatureOn("first-task", user)) && searchParams.classic !== "1") {',
    to: "  if (true) {",
    expect: "behind the switch, instead of the questionnaire, which ?classic=1 still opens",
  },
  {
    name: "the sign-in splash says a line in English on every screen",
    file: SPLASH,
    from: '    loading: t("loading"),',
    to: '    loading: "Loading workspace...",',
    expect: "the sign-in splash says its three lines from the catalogue",
  },
  {
    name: "the out-of-credits refusal carries only its English sentence",
    file: CHAT_ROUTE,
    from: '          code: "insufficientCredits",\n          outOfCredits: true,\n',
    to: "",
    expect: "Chat's out-of-credits refusal is named, not only an English sentence",
  },
  {
    name: "the Chat screen prints the route's English sentence",
    file: CHAT_SCREEN,
    from: "          setError(\n            data.outOfCredits === true\n              ? outOfCreditsText(data.available, data.needed)\n              : isErrorCode(data.code)\n                ? describe(new ApiError(429, { code: data.code })).text\n                : describeStatus(429).text\n          );",
    to: "          setError(data.message);",
    expect: "...and the Chat screen says it in the reader's language",
  },
];

runMutations({
  name: "first-task",
  gate: GATE,
  targets: [LIB, SCREEN, PAGE, CHAT, SPLASH, CHAT_ROUTE, CHAT_SCREEN],
  mutants: MUTANTS,
});
