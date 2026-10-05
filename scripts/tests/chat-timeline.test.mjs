// A CHAT ANSWER THAT SEARCHES SHOWS ITS STEPS, AND PRICES NONE OF THEM.
//
// V6.2 2.1, slice 6 (docs/QUEUE.md 0.1). The chat route
// (src/app/api/chat/route.ts) marks each phase as it really opens: the
// model starting, a web search block, the data tool, the first word.
// src/lib/chat/chat-timeline.ts turns the marks into steps. Held here by
// running it: one step per phase, not per delta; durations from the marks;
// sources counted from the search results; credits never split, because
// one model call both searches and writes and its usage arrives once; and
// a plain answer shows no timeline at all. Then the route and the screen,
// stripped of comments, wired to it.
//
// Run: node scripts/tests/chat-timeline.test.mjs
import { readFileSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";
import { loadTsLinked } from "./load-ts.mjs";

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

const {
  CHAT_STEPS,
  MAX_CHAT_STEPS,
  markChatStep,
  addChatEvidence,
  chatTimelineForClient,
  chatTimelineWorthShowing,
  readChatStepFrame,
} = await loadTsLinked("src/lib/chat/chat-timeline.ts");

const t0 = Date.parse("2026-10-04T12:00:00Z");
const at = (s) => new Date(t0 + s * 1000).toISOString();

console.log("== 1. the marks ==");
let tl = [];
tl = markChatStep(tl, "thinking", at(0));
tl = markChatStep(tl, "searching_web", at(2));
tl = addChatEvidence(tl, { key: "sources", count: 5 });
tl = markChatStep(tl, "searching_web", at(4));
tl = addChatEvidence(tl, { key: "sources", count: 3 });
tl = markChatStep(tl, "writing", at(9));
const same = markChatStep(tl, "writing", at(10));
check("the same phase twice in a row is one step (every text delta marks 'writing')", same === tl && tl.length === 3, tl.map((e) => e.label).join());
check("two searches in a row add their sources", tl[1].evidence?.key === "sources" && tl[1].evidence.count === 8, JSON.stringify(tl[1].evidence));
check("evidence with an unknown key is dropped", addChatEvidence(tl, { key: "usd", count: 1 }) === tl);
check("a phase coming back after another is a new step", markChatStep(tl, "searching_web", at(12)).length === 4);
let many = [];
for (let i = 0; i < 40; i++) many = markChatStep(many, i % 2 ? "writing" : "searching_web", at(i));
check(`a runaway loop stops at ${MAX_CHAT_STEPS} steps`, many.length === MAX_CHAT_STEPS, String(many.length));

console.log("\n== 2. what the screen gets ==");
const live = chatTimelineForClient(tl, null);
check("one step per phase, numbered from 1", live.map((s) => s.step).join() === "1,2,3");
check("closed steps are measured: 2s, 7s", live[0].seconds === 2 && live[1].seconds === 7, live.map((s) => s.seconds).join());
check("the open step has no duration while it streams", live[2].seconds === null);
const done = chatTimelineForClient(tl, at(15));
check("the done frame closes the last step: 6s", done[2].seconds === 6, String(done[2].seconds));
check("no step is ever priced — one call searches and writes", [...live, ...done].every((s) => s.credits === null));
check("the label is the phase key, never a sentence", done.every((s) => CHAT_STEPS.includes(s.label)));

console.log("\n== 3. shown only when the answer did more than write ==");
check("thinking then writing: nothing to show", !chatTimelineWorthShowing([{ label: "thinking" }, { label: "writing" }]));
check("a web search: shown", chatTimelineWorthShowing([{ label: "thinking" }, { label: "searching_web" }]));
check("a data search: shown", chatTimelineWorthShowing([{ label: "searching_data" }]));

console.log("\n== 4. frames from the stream are checked before they are drawn ==");
check("a well-formed step is kept", readChatStepFrame({ label: "writing", at: at(0) })?.label === "writing");
check("an unknown phase is dropped", readChatStepFrame({ label: "hacking", at: at(0) }) === null);
check("a bad time is dropped", readChatStepFrame({ label: "writing", at: "yesterday" }) === null);
check("anything else is dropped", readChatStepFrame(null) === null && readChatStepFrame("x") === null);

console.log("\n== 5. the route marks the real phases ==");
const ROUTE = stripComments(readFileSync("src/app/api/chat/route.ts", "utf8"));
check("thinking is marked before the first model call", /markStep\("thinking"\);\s*for \(let round = 0; round <= MAX_TOOL_ROUNDS; round\+\+\)/.test(ROUTE));
check(
  "a web search block opening is the search",
  /block\.type === "server_tool_use" && block\.name === "web_search"\) markStep\("searching_web"\)/.test(ROUTE)
);
check(
  "the search result block counts its sources",
  /block\.type === "web_search_tool_result" && Array\.isArray\(block\.content\)\)\s*\{\s*chatTimeline = addChatEvidence\(chatTimeline, \{ key: "sources", count: block\.content\.length \}\)/.test(ROUTE)
);
check("the first word is the writing", /claudeStream\.on\("text", \(delta\) => \{\s*markStep\("writing"\);/.test(ROUTE));
check("the data tool round is marked before it runs", /markStep\("searching_data"\);\s*const results = await Promise\.all\(/.test(ROUTE));
check("every change is sent as a timeline frame", /ndjsonLine\(\{ type: "timeline", steps: chatTimelineForClient\(chatTimeline, null\) \}\)/.test(ROUTE));
check(
  "the done frame closes it, only for an answer worth showing",
  /timeline: chatTimelineWorthShowing\(chatTimeline\)\s*\?\s*chatTimelineForClient\(chatTimeline, new Date\(\)\.toISOString\(\)\)\s*:\s*undefined/.test(ROUTE)
);

console.log("\n== 6. the screen draws it ==");
const UI = stripComments(readFileSync("src/components/chat/chat-workspace.tsx", "utf8"));
check("a timeline frame replaces the live steps, through the guard", /event\.type === "timeline"\)\s*\{\s*setLiveTimeline\(keepChatSteps\(event\.steps\) \?\? \[\]\)/.test(UI));
check("the done frame's steps stay on the finished answer", /finishedTimeline = keepChatSteps\(event\.timeline\)/.test(UI) && /timeline: finishedTimeline,/.test(UI));
check("the live steps are open while the answer streams", (UI.match(/timeline: liveTimeline \}\} labelFor=\{chatStepLabel\} defaultOpen/g) ?? []).length === 2);
check("a plain answer keeps the thinking indicator", /chatTimelineWorthShowing\(liveTimeline\) \? \([\s\S]{0,200}\) : \(\s*<AiActivity kind="chat"/.test(UI));
check("the finished answer carries its steps", /<AiJobTimeline job=\{\{ kind: "chat", timeline: msg\.timeline \}\} labelFor=\{chatStepLabel\} \/>/.test(UI));
check("the phases are translated, not shown as keys", /isChatStep\(label\) \? tSteps\(CHAT_STEP_MESSAGE\[label\]\) : null/.test(UI));
check("a step that is not a chat phase drops the whole frame", /return steps\.length === raw\.length \? steps : undefined;/.test(UI));

const locales = ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"];
for (const l of locales) {
  const m = JSON.parse(readFileSync(`messages/${l}.json`, "utf8"));
  const steps = m?.aiSteps?.chatTimeline ?? {};
  check(`${l}: the four phases are worded`, CHAT_STEPS.every((s) => typeof steps[s] === "string" && steps[s].length > 0));
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
