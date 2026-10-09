#!/usr/bin/env node
/*
 * THE FIRST TASK (MASTER 10 and 16, package 39): a new account lands on
 * three tasks that finish on any plan, one press each, and the press both
 * records what began the account and opens the answer.
 *
 * Held here: every task lands in Chat, the one tool the Free plan has, and
 * Chat reads both halves of the address the task builds; the press records
 * BEFORE it leaves, and records completion, so Home does not send the
 * person back; an account that has finished or skipped never sees it; the
 * questionnaire stays one press away; the switch decides it; the words in
 * the ten languages.
 *
 * The screen in a browser: first-task.prodtest.mjs.
 *
 * Run: node scripts/tests/first-task.test.mjs
 */
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}
const code = (p) => stripComments(readFileSync(p, "utf8"));

const tasks = await loadTs("src/lib/onboarding/first-tasks.ts");
const modes = await loadTs("src/lib/chat/work-modes.ts");
const examples = await loadTs("src/lib/overview/first-screen-examples.ts");

console.log("first-task");

// ---------------------------------------------------------------------
console.log("\n== 1. the three tasks ==");
// ---------------------------------------------------------------------
const list = tasks.FIRST_TASKS;
check("three tasks, three different ways of working", list.length === 3 && new Set(list.map((t) => t.mode)).size === 3 && new Set(list.map((t) => t.id)).size === 3);
check("...each one Chat knows", list.every((t) => modes.readWorkMode(t.mode) === t.mode));
const href = tasks.firstTaskHref("Γράψε ένα email & μια προσφορά", "create");
const url = new URL(href, "http://x");
check("a task opens Chat with the task already in it, and its way of working", url.pathname === "/dashboard/chat" && url.searchParams.get("ask") === "Γράψε ένα email & μια προσφορά" && url.searchParams.get("mode") === "create", href);
check("...the person's own sentence, without one", new URL(tasks.firstTaskHref("κάτι δικό μου", null), "http://x").searchParams.get("mode") === null);
check("...clamped to what the page reads", new URL(tasks.firstTaskHref("x".repeat(5000), null), "http://x").searchParams.get("ask").length === examples.MAX_EXAMPLE_CHARS);
check("what began the account is recorded by name", tasks.goalFor("write") === "first-task:write" && tasks.goalFor("own") === "first-task:own");
const api = code("src/app/api/onboarding/route.ts");
const maxGoal = Number(api.match(/const MAX_GOAL_CHARS = (\d+);/)?.[1] ?? 0);
check("...and the record fits where it is kept", [...list.map((t) => t.id), "own"].every((id) => tasks.goalFor(id).length <= maxGoal), String(maxGoal));

// ---------------------------------------------------------------------
console.log("\n== 2. every one finishes on the Free plan ==");
// ---------------------------------------------------------------------
const catalog = readFileSync("src/lib/billing/feature-catalog.ts", "utf8");
check("Chat is on the Free plan", /id: "aiChat",\s*group: "\w+",\s*minPlan: "free",/.test(catalog));
const chatPage = code("src/app/dashboard/chat/page.tsx");
check("Chat reads the task and sends it", /initialAsk=\{readExampleParam\(searchParams\.ask\)\}/.test(chatPage) && /if \(!initialAsk \|\| sentAskRef\.current\) return;/.test(code("src/components/chat/chat-workspace.tsx")));
check("...and reads its way of working", /initialWorkMode=\{readWorkMode\(searchParams\.mode\) \?\? undefined\}/.test(chatPage));
const lib = code("src/lib/onboarding/first-tasks.ts");
check("no task leaves for another tool", (lib.match(/`\/dashboard\/[a-z-]+/g) ?? []).every((p) => p === "`/dashboard/chat"));

// ---------------------------------------------------------------------
console.log("\n== 3. the screen ==");
// ---------------------------------------------------------------------
const screen = code("src/components/onboarding/first-task.tsx");
const begin = screen.slice(screen.indexOf("async function begin("), screen.indexOf("async function skip("));
check("a press records completion and what began it, BEFORE it leaves", /await fetch\("\/api\/onboarding", \{[\s\S]*?body: JSON\.stringify\(\{ completed: true, goal \}\),[\s\S]*?\}\);[\s\S]*?router\.push\(href\);/.test(begin));
check("...and leaves even when the record could not be kept", /\} catch \{[\s\S]*?\}\s*router\.push\(href\);/.test(begin));
check("...once: a second press while it leaves does nothing", /if \(busy\) return;\s*setBusy\(key\);/.test(begin));
check("every task is offered, each with its own way of working", /FIRST_TASKS\.map\(\(task\) =>/.test(screen) && /begin\(task\.id, goalFor\(task\.id\), firstTaskHref\(text\[task\.id\], task\.mode\)\)/.test(screen));
check("the person's own sentence goes the same way", (screen.match(/begin\("own", goalFor\("own"\), firstTaskHref\(ownText, null\)\)/g) ?? []).length === 2);
check("...and only when there is one", /if \(ownText\) void begin\("own"/.test(screen) && /disabled=\{!ownText \|\| busy !== null\}/.test(screen));
check("«Παράλειψη» records the skip, as the questionnaire did", /async function skip\(\)[\s\S]*?JSON\.stringify\(\{ skipped: true \}\)[\s\S]*?router\.push\("\/dashboard\/overview"\);/.test(screen));
check("the data import is one press away", /href="\/onboarding\?classic=1"/.test(screen));

// ---------------------------------------------------------------------
console.log("\n== 4. who meets it ==");
// ---------------------------------------------------------------------
const page = code("src/app/onboarding/page.tsx");
const branch = page.indexOf('if ((await isFeatureOn("first-task", user)) && searchParams.classic !== "1") {');
check("behind the switch, instead of the questionnaire, which ?classic=1 still opens", branch > 0 && page.indexOf("<FirstTask") > branch && page.indexOf("<FirstTask") < page.indexOf("<OnboardingFlow"));
const done = page.indexOf('if (!stateError && (state?.completed_at || state?.skipped_at)) {\n    redirect("/dashboard/overview");');
check("an account that finished or skipped never meets it", done > 0 && branch > done);
const redirects = await loadTs("src/lib/nav/early-redirects.ts");
check("a new account opening Home is sent to it", redirects.onboardingRedirectTarget({ error: null, state: null }) === "/onboarding");
check("...and not once it began a task", redirects.onboardingRedirectTarget({ error: null, state: { completed_at: "2026-10-07T10:00:00Z" } }) === null);
check("the switch is declared", /\n  "first-task": "/.test(readFileSync("src/lib/flags/flags.ts", "utf8")));

// ---------------------------------------------------------------------
console.log("\n== 5. the words ==");
// ---------------------------------------------------------------------
const used = new Set([...screen.matchAll(/\bt\("([a-zA-Z_.0-9]+)"/g)].map((m) => m[1]));
check(`the keys the screen uses were found (${used.size})`, used.size >= 12);
const LOCALES = ["ar", "de", "el", "en", "es", "fr", "it", "ja", "pt", "zh"];
for (const loc of LOCALES) {
  const words = JSON.parse(readFileSync(`messages/${loc}.json`, "utf8")).dashboard?.firstTask ?? {};
  const get = (k) => k.split(".").reduce((o, p) => (o && typeof o === "object" ? o[p] : undefined), words);
  const missing = [...used].filter((k) => typeof get(k) !== "string" || !get(k).trim());
  const braces = [...used].filter((k) => /[{}]/.test(get(k) ?? ""));
  check(`${loc}.json: every word, and no placeholder to escape`, missing.length === 0 && braces.length === 0, [...missing, ...braces].join(", "));
}

// ---------------------------------------------------------------------
console.log("\n== 6. on the way there, in the reader's language ==");
// ---------------------------------------------------------------------
// Both found on 2026-10-08 by first-task-edges.prodtest.mjs, which reads
// every text the screen shows from the login page to the answer: the
// sign-in splash was three English literals, and Chat printed the route's
// English out-of-credits sentence on a Greek screen.
const splash = code("src/components/auth/login-splash.tsx");
check(
  "the sign-in splash says its three lines from the catalogue",
  /useTranslations\("auth\.splash"\)/.test(splash) &&
    /const lines[^=]*=\s*\{\s*loading: t\("loading"\),\s*syncing: t\("syncing"\),\s*ready: t\("ready"\),\s*\};/.test(splash) &&
    /\{lines\[STEPS\[step\]\]\}/.test(splash)
);
for (const loc of LOCALES) {
  const words = JSON.parse(readFileSync(`messages/${loc}.json`, "utf8")).auth?.splash ?? {};
  const ok = ["loading", "syncing", "ready"].every((k) => typeof words[k] === "string" && words[k].trim() && !/[{}]/.test(words[k]));
  check(`${loc}.json: the splash's three lines`, ok && (loc !== "el" || /[\u0370-\u03ff]/.test(words.loading)), JSON.stringify(words));
}
check(
  "Chat's out-of-credits refusal is named, not only an English sentence",
  // Named by its code and flag, which packages 1, 7 and 9 read too
  // (scripts/tests/conversation-design.test.mjs, chat-opens-tools,
  // chat-attachments).
  /rateLimited: true,\s*code: "insufficientCredits",\s*outOfCredits: true,\s*message: insufficientCreditsMessage\(/.test(code("src/app/api/chat/route.ts"))
);
check(
  "...and the Chat screen says it in the reader's language",
  /setError\(\s*data\.outOfCredits === true\s*\?\s*outOfCreditsText\(data\.available, data\.needed\)/.test(code("src/components/chat/chat-workspace.tsx")) &&
    !/setError\(data\.message\)/.test(code("src/components/chat/chat-workspace.tsx"))
);

console.log(failures.length ? `\nFAILED: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
