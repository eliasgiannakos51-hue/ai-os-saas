// HOME IS THE DESIGN'S ONE BLOCK, AND NOTHING IT CARRIED WAS LOST.
//
// docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN — «ΑΡΧΙΚΗ»; BUILD-SPECS 2.4 scenarios
// 16–18: the greeting follows the hour and drops the name when we do not
// know it; each quick action opens the chat in the right way of working;
// and Home has nothing else — no cards, no numbers, no lists. The design's
// other rule, «Καμία λειτουργία δεν χάνεται», is held in section 4: every
// card that left is on /dashboard/activity, which is a row in All tools.
//
// The modes (src/lib/chat/work-modes.ts) and the greeting's hour are run;
// the pages, the chat workspace and the chat route are read with their
// comments stripped.
//
// Run: node scripts/tests/home-design.test.mjs
import { readFileSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}
const read = (f) => stripComments(readFileSync(f, "utf8"));
const LOCALES = ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"];
const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));

console.log("== 1. the greeting follows the hour, and has no name it does not know ==");
const G = await loadTs("src/lib/greeting.ts");
const at = (h) => G.timeOfDayGreeting(new Date(2026, 9, 4, h, 0)).part;
check("09:00 is morning, 14:00 afternoon, 21:00 evening", at(9) === "morning" && at(14) === "afternoon" && at(21) === "evening");
check("the edges: 11:59 morning, 12:00 afternoon, 18:00 evening", G.timeOfDayGreeting(new Date(2026, 9, 4, 11, 59)).part === "morning" && at(12) === "afternoon" && at(18) === "evening");
check("no name is invented from nothing", G.greetingName({}) === null && G.greetingName(null) === null);
const greeting = read("src/components/overview/greeting-header.tsx");
check("the name is written only when there is one", /\{name \? `, \$\{name\}` : ""\}/.test(greeting));
check("the small earth sits beside it, at 64px", /<Earth variant="small" px=\{64\}/.test(greeting) && greeting.indexOf("<Earth") < greeting.indexOf("<h1"));
for (const l of LOCALES) {
  const g = messages[l].promise?.greeting ?? {};
  check(`${l}: morning, afternoon and evening are worded`, ["morning", "afternoon", "evening"].every((k) => typeof g[k] === "string" && g[k].length > 0));
}

console.log("\n== 2. each quick action opens the chat in its own way of working ==");
const W = await loadTs("src/lib/chat/work-modes.ts");
check("the four are the design's, in its order: Research, Create, Run, Analyze", W.WORK_MODES.join() === "research,create,run,analyze");
check("each opens the chat with its mode", W.WORK_MODES.every((m) => W.workModeHref(m) === `/dashboard/chat?mode=${m}`));
check("a mode is one of the four or none", W.WORK_MODES.every((m) => W.readWorkMode(m) === m) && [undefined, null, "", "RESEARCH", "admin", 3, ["run"]].every((v) => W.readWorkMode(v) === null));
const texts = W.WORK_MODES.map((m) => W.workModeInstruction(m));
check("each mode says something, and something different", texts.every((t) => t.trim().length > 80) && new Set(texts).size === 4);
check("no mode adds nothing at all", W.workModeInstruction(null) === "");
const quick = read("src/components/home/quick-actions.tsx");
check("the quick actions are drawn from the four, through their href", /\{WORK_MODES\.map\(\(mode\) => \{/.test(quick) && /href=\{workModeHref\(mode\)\}/.test(quick));
check("...as links of a tappable size", /<Link\b/.test(quick) && /min-h-\[44px\]/.test(quick));
const chatPage = read("src/app/dashboard/chat/page.tsx");
check("the chat page reads the mode from the URL, through readWorkMode", /initialWorkMode=\{readWorkMode\(searchParams\.mode\) \?\? undefined\}/.test(chatPage));
const ws = read("src/components/chat/chat-workspace.tsx");
check("the workspace starts in that mode", /useState<WorkMode \| null>\(initialWorkMode \?\? null\)/.test(ws));
check("...sends it with every message", /\.\.\.\(workMode \? \{ workMode \} : \{\}\)/.test(ws));
check("...shows it, and lets the person clear it", /onClick=\{\(\) => setWorkMode\(null\)\}/.test(ws) && /t\("workMode\.active", \{ mode: tModes\(workMode\) \}\)/.test(ws));
const route = read("src/app/api/chat/route.ts");
check("the route reads the mode through readWorkMode, never raw", /workMode = readWorkMode\(body\?\.workMode\);/.test(route) && !/body\?\.workMode(?!\))/.test(route.replace("readWorkMode(body?.workMode)", "")));
check(
  "...and adds it at the END of the prompt, so the cached prefix is the same with or without it",
  /const systemDynamicSuffix =[\s\S]{0,200}\+ workModeInstruction\(workMode\);/.test(route) &&
    !/systemStaticPrefix[^;]*workModeInstruction/.test(route) &&
    !/systemPerUser =[^;]*workModeInstruction/.test(route)
);
for (const l of LOCALES) {
  const a = messages[l].dashboard?.home?.actions ?? {};
  const wm = messages[l].dashboard?.chat?.workMode ?? {};
  check(
    `${l}: the four actions, the chip and its clear button are worded`,
    W.WORK_MODES.every((m) => typeof a[m] === "string" && a[m].length > 0) && /\{mode\}/.test(wm.active ?? "") && typeof wm.clear === "string"
  );
}

console.log("\n== 3. Home has nothing else ==");
const home = read("src/app/dashboard/overview/page.tsx");
const componentImports = [...home.matchAll(/from "@\/components\/([^"]+)"/g)].map((m) => m[1]).sort();
check(
  "Home draws the greeting, the field, the quick actions — and only the boundary around them",
  componentImports.join() === "create/create-chat,home/quick-actions,overview/greeting-header,ui/widget-boundary",
  componentImports.join(", ")
);
const order = ["<GreetingHeader", "<CreateChat", "<QuickActions"].map((tag) => home.indexOf(tag));
check("...in that order", order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], order.join(" < "));
check("no card, no number, no list is read for it", (home.match(/\.from\("/g) ?? []).length === 1);
const field = read("src/components/create/create-chat.tsx");
check("the field asks the design's question on Home", /placeholder=\{hero \? t\("accomplishPlaceholder"\) : t\("describePlaceholder"\)\}/.test(field));
check("attach and voice bottom-left, send bottom-right", /absolute bottom-3 start-3 z-\[2\]/.test(field) && /absolute bottom-3 start-14 z-\[2\]/.test(field) && /absolute bottom-3 end-3 z-\[2\][^"]*bg-button text-button-ink/.test(field));
for (const l of LOCALES) {
  check(`${l}: the field's question is worded`, typeof messages[l].dashboard?.createAnything?.accomplishPlaceholder === "string");
}

console.log("\n== 4. and every card that left is on Activity ==");
const activity = read("src/app/dashboard/activity/page.tsx");
const LEFT_HOME = [
  "NextCard", "WhatChangedCard", "InsightList", "HealthScoreCard", "SetupProgressCard",
  "HomeStatCard", "CreditsHomeStat", "RecentEntriesCard", "EnergyCheckinWidget",
  "LoadSampleButton", "BetaExpiryBanner", "BetaFeedbackBanner", "HomeSeenStamp",
];
const missing = LEFT_HOME.filter((c) => !new RegExp(`<${c}\\b`).test(activity));
check(`all ${LEFT_HOME.length} are rendered there`, missing.length === 0, missing.join(", "));
const nav = read("src/lib/sidebar-nav.ts");
check(
  "Activity is a row in All tools, not a hidden page",
  /\{ href: "\/dashboard\/activity", label: "Activity", icon: ACTIVITY_ICON, hintKey: "activity" \}/.test(nav)
);

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
