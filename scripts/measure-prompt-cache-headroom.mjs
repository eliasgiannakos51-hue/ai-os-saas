#!/usr/bin/env node
/**
 * WHICH CALL SITES WOULD ACTUALLY GAIN FROM PROMPT CACHING.
 *
 * Run: node scripts/measure-prompt-cache-headroom.mjs
 *
 * Reports; does not gate. docs/COST-LAYER.md §(a) quotes its output.
 *
 * WHY IT WAS REWRITTEN (2026-11-05). The first version found call sites by
 * grepping for `messages.create`. Since the provider router
 * (src/lib/ai/providers/complete.ts, `runCompletion`) took over, almost
 * every call goes through it instead, and that grep saw 5 call sites of
 * 52 while printing a confident verdict about all of them — the exact
 * shape CLAUDE.md calls "a number printed and never judged".
 *
 * WHAT IT DOES NOW.
 *   1. CENSUS. Every `runCompletion(` call and every direct SDK call
 *      (`messages.create(`, `messages.stream(`, `batches.create(`) outside
 *      the provider adapters, counted in comment-stripped source, per file,
 *      with whether the file uses caching at all.
 *   2. THE REAL PROMPT. For each uncached site in SITES below, the system
 *      prompt is BUILT by the code itself (scripts/tests/load-ts.mjs,
 *      probeTs) — not guessed from the longest literal. When a builder
 *      takes per-call input, it is called twice with different input and
 *      only the common prefix counts, because only a prefix can be cached.
 *   3. THE REPO'S OWN RULE. Each prefix is judged by isWorthCaching
 *      (src/lib/ai/cached-system.ts): characters / 4 against the model's
 *      minimum. That divisor UNDER-counts Greek, so a Greek prompt judged
 *      "under" may be over; the column `gr` marks those.
 *   4. NOTHING MISSED SILENTLY. A file with model calls and no caching
 *      that SITES does not list is printed as NOT MEASURED.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { loadTs, probeTs } from "./tests/load-ts.mjs";
import { stripComments } from "./check-mutation-markers.mjs";

const cs = await loadTs("src/lib/ai/cached-system.ts");
const SONNET = "claude-sonnet-4-6";
const HAIKU = "claude-haiku-4-5";

// Each uncached call site: the file that makes the call, the model it asks
// for, the module whose scope builds the prompt, and the expression(s)
// that build it. Two expressions = the same builder with different
// per-call input; the common prefix is what could be cached.
const SITES = [
  { file: "src/app/api/my-stuff/ask/route.ts", model: SONNET, entry: "src/lib/my-stuff/ask-context.ts", exprs: ["buildMyStuffPrompt('Πόσα έσοδα είχα;','CTX-A one').system", "buildMyStuffPrompt('Τι εκκρεμεί;','ZZ other').system"] },
  { file: "src/app/api/transitions/detect/route.ts", model: SONNET, entry: "src/app/api/transitions/detect/route.ts", exprs: ["buildSystemPrompt()"] },
  { file: "src/app/api/data-analysis/[id]/ask/route.ts", model: SONNET, entry: "src/lib/data-analysis/query.ts", exprs: ["QUESTION_SYSTEM"] },
  { file: "src/app/api/data-analysis/[id]/analyse/route.ts", model: SONNET, entry: "src/lib/data-analysis/analyse.ts", exprs: ["ANALYSIS_SYSTEM"] },
  { file: "src/app/api/text-actions/route.ts", label: "longest action", model: SONNET, entry: "src/app/api/text-actions/route.ts", exprs: ["Object.values(SYSTEM_PROMPTS_WITH_QUALITY_CYCLE).sort((a,b)=>b.length-a.length)[0]"] },
  { file: "src/app/api/coding/run/route.ts", model: SONNET, entry: "src/lib/coding/operations.ts", exprs: ["buildCodePrompt({operation:'generate',input:'a function that adds',language:'ts'}).system", "buildCodePrompt({operation:'generate',input:'zz other request',language:'py'}).system"] },
  { file: "src/app/api/mcp/[id]/run/route.ts", model: SONNET, entry: "src/lib/mcp/plan.ts", exprs: ["buildPlanPrompt('do x',[{name:'a',description:'d',readOnly:true,inputSchema:{}}]).system", "buildPlanPrompt('zz y',[{name:'zz',description:'e',readOnly:false,inputSchema:{type:'object'}}]).system"] },
  { file: "src/app/api/documents/[id]/pdf/route.ts", model: SONNET, entry: "src/lib/documents/translation.ts", exprs: ["translationSystemPrompt('el')"] },
  { file: "src/lib/reflection-agent.ts", model: SONNET, entry: "src/lib/reflection-agent.ts", exprs: ["reflectionSystemPrompt('el')"] },
  { file: "src/lib/jobs/handlers/file-ask.ts", label: "ask (2 calls)", model: SONNET, entry: "src/lib/files/ask.ts", exprs: ["askSystemPrompt({language:'el',filenames:['a.pdf'],truncated:false})", "askSystemPrompt({language:'el',filenames:['zz.docx','b'],truncated:true})"] },
  { file: "src/lib/jobs/handlers/file-ask.ts", label: "synthesis", model: SONNET, entry: "src/lib/files/ask.ts", exprs: ["synthesisSystemPrompt({language:'el',parts:2,truncated:false})", "synthesisSystemPrompt({language:'el',parts:7,truncated:true})"] },
  { file: "src/lib/agents/agent-builder.ts", model: SONNET, entry: "src/lib/agents/agent-builder.ts", exprs: ["BUILDER_SYSTEM_PROMPT"] },
  // agent-runner.ts cannot be bundled (two modules on its graph declare
  // `word`), so its two builders are bounded by their whole source text.
  { file: "src/lib/agents/agent-runner.ts", label: "research round + run (2 calls)", model: SONNET, bound: { file: "src/lib/agents/agent-runner.ts", fns: ["researchSystemPrompt", "runnerSystemPrompt"] } },
  { file: "src/lib/ai/batch/batch-client.ts", label: "batch submit; prompt built in lib/ai/batch/agent-batch.ts", model: SONNET, bound: { file: "src/lib/agents/agent-runner.ts", fns: ["runnerSystemPrompt"] } },
  { file: "src/lib/agents/template-fill.ts", model: HAIKU, entry: "src/lib/agents/template-fill.ts", exprs: ["SYSTEM_PROMPT"] },
  { file: "src/lib/research/research.ts", label: "plan", model: SONNET, entry: "src/lib/research/research.ts", exprs: ["planSystemPrompt('el')"] },
  { file: "src/lib/research/research.ts", label: "question", model: SONNET, entry: "src/lib/research/research.ts", exprs: ["questionSystemPrompt('el')"] },
  { file: "src/lib/research/research.ts", label: "synthesis", model: SONNET, entry: "src/lib/research/research.ts", exprs: ["synthesisSystemPrompt('el',0)", "synthesisSystemPrompt('el',4)"] },
  { file: "src/lib/clarification.ts", label: "longest kind", model: SONNET, entry: "src/lib/clarification.ts", exprs: ["Object.values(SYSTEM_PROMPTS).sort((a,b)=>b.length-a.length)[0]"] },
  { file: "src/lib/mission-agents.ts", label: "research (the third call; the other two cache)", model: SONNET, entry: "src/lib/mission-agents.ts", exprs: ["RESEARCH_SYSTEM_PROMPT"] },
  { file: "src/lib/meetings/meeting-ask-call.ts", model: SONNET, entry: "src/lib/meetings/meeting-ask.ts", exprs: ["buildMeetingAskPrompt('q one','T1 text',null,[]).system", "buildMeetingAskPrompt('zz two','zz other','S',[]).system"] },
  { file: "src/lib/meetings/meeting-analyse-call.ts", model: SONNET, entry: "src/lib/meetings/meeting-analysis.ts", exprs: ["systemPrompt('Greek')"] },
  { file: "src/lib/translate/translate-call.ts", label: "page", model: SONNET, entry: "src/lib/translate/translate-prompt.ts", exprs: ["translateSystemPrompt('el')"] },
  { file: "src/lib/translate/translate-call.ts", label: "edit", model: SONNET, entry: "src/lib/translate/translate-prompt.ts", exprs: ["translateEditSystemPrompt('el','formal',[])", "translateEditSystemPrompt('el','formal',['zz'])"] },
  { file: "src/lib/chat/memory.ts", label: "extraction, brand variant", model: SONNET, entry: "src/lib/chat/memory.ts", exprs: ["EXTRACTION_SYSTEM_PROMPT + BRAND_EXTRACTION_RULE"] },
  { file: "src/lib/website-security-review.ts", model: SONNET, entry: "src/lib/website-security-review.ts", exprs: ["SYSTEM_PROMPT"] },
  { file: "src/lib/websites-greek-spelling-check.ts", model: SONNET, entry: "src/lib/websites-greek-spelling-check.ts", exprs: ["SYSTEM"] },
  { file: "src/lib/import/paste.ts", model: SONNET, entry: "src/lib/import/paste.ts", exprs: ["pasteSystemPrompt('el')"] },
  { file: "src/lib/import/map-columns.ts", model: SONNET, entry: "src/lib/import/map-columns.ts", exprs: ["mapperSystemPrompt()"] },
  { file: "src/lib/rebuild/rebuild-call.ts", model: SONNET, entry: "src/lib/rebuild/rebuild-system.ts", exprs: ["rebuildSystemPrompt()"] },
  { file: "src/lib/apps/app-call.ts", model: SONNET, entry: "src/lib/apps/app-system.ts", exprs: ["appSystemPrompt()"] },
  { file: "src/lib/lead-classification.ts", model: SONNET, entry: "src/lib/lead-classification.ts", exprs: ["SYSTEM_PROMPT"] },
  { file: "src/lib/games/game-call.ts", model: SONNET, entry: "src/lib/games/game-system.ts", exprs: ["gameSystemPrompt()"] },
  { file: "src/lib/insights/narrate.ts", model: SONNET, entry: "src/lib/insights/narrate.ts", exprs: ["narrateSystemPrompt('el')"] },
  { file: "src/lib/automations/builder.ts", label: "2 calls", model: SONNET, entry: "src/lib/automations/builder.ts", exprs: ["SYSTEM"] },
  { file: "src/lib/automations/runner.ts", model: SONNET, bound: { file: "src/lib/automations/runner.ts", literal: /text: "(You are one step of the person[^"]*)"/ } },
  { file: "src/lib/website-builder.ts", label: "classifyWebsiteDescription (the other two calls cache)", model: SONNET, entry: "src/lib/website-builder.ts", exprs: ["CLASSIFY_SYSTEM_PROMPT"] },
  // records/ask cannot be bundled (two modules declare CHARS_PER_TOKEN).
  // Its prompt puts the RECORD first and ~6,500 characters of constants
  // after it, so its cacheable prefix is the module title line only.
  { file: "src/app/api/records/ask/route.ts", label: "record first, constants after", model: SONNET, bound: { file: "src/app/api/records/ask/route.ts", literal: /return `([^`$]*)\$\{enModuleTitle/ } },
];

// ---------------------------------------------------------------- census
const SDK_CALL = /\b(?:messages\.(?:create|stream)|batches\.create)\(/g;
const files = execFileSync("grep", ["-rlE", "runCompletion\\(|messages\\.(create|stream)\\(|batches\\.create\\(", "src", "--include=*.ts", "--include=*.tsx"], { encoding: "utf8" })
  .trim().split("\n").filter((f) => f && !f.includes("/providers/") && !/\.test\./.test(f));
const census = files.map((file) => {
  const src = stripComments(readFileSync(file, "utf8"));
  const calls = (src.match(/\brunCompletion\(/g) ?? []).length - (src.match(/function runCompletion\(/g) ?? []).length + (src.match(SDK_CALL) ?? []).length;
  return { file, calls, caches: /buildCachedSystem\(|cache_control:/.test(src) };
}).filter((r) => r.calls > 0).sort((a, b) => a.file.localeCompare(b.file));
const total = census.reduce((n, r) => n + r.calls, 0);
console.log(`CENSUS — ${total} model call(s) in ${census.length} file(s), provider adapters excluded\n`);
for (const r of census) console.log(`  ${String(r.calls).padStart(2)}  ${r.caches ? "caches " : "       "}  ${r.file}`);
const neverCache = census.filter((r) => !r.caches);
console.log(`\n  ${census.filter((r) => r.caches).length} file(s) use caching; ${neverCache.length} file(s) with ${neverCache.reduce((n, r) => n + r.calls, 0)} call(s) never do.`);

// ---------------------------------------------------------- measurement
const lcp = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return a.slice(0, i); };
const hasGreek = (s) => /[Ͱ-Ͽἀ-῿]/.test(s);
function boundOf(b) {
  const src = readFileSync(b.file, "utf8");
  if (b.literal) return src.match(b.literal)?.[1] ?? "";
  return b.fns.map((fn) => { const i = src.indexOf(`function ${fn}(`); return i < 0 ? "" : src.slice(i, src.indexOf("\n}\n", i)); }).sort((x, y) => y.length - x.length)[0];
}
const rows = [];
for (const s of SITES) {
  let text = null, how = "built by the code", error = null;
  if (s.bound) { text = boundOf(s.bound); how = s.bound.literal ? "static literal" : "upper bound: whole function source"; }
  else {
    try {
      const vals = await probeTs(s.entry, s.exprs);
      const bad = vals.find((v) => typeof v !== "string");
      if (bad) error = String(bad.error).slice(0, 200); else text = vals.reduce(lcp);
    } catch (err) { error = String(err.message).split("\n")[0].replace(/ imported from data:.*/, ""); }
  }
  if (text === null || text === "") { rows.push({ ...s, error: error ?? "nothing measured" }); continue; }
  rows.push({ ...s, chars: text.length, tokens: cs.approximateTokens(text), min: cs.modelCacheMinimumTokens(s.model), worth: cs.isWorthCaching(text, s.model), greek: hasGreek(text), how });
}
const line = (r) => `  ${String(r.chars).padStart(6)} ch ${String(r.tokens).padStart(5)} tok / ${r.min}  ${r.greek ? "gr" : "  "}  ${r.file.replace(/^src\//, "")}${r.label ? ` — ${r.label}` : ""}${r.how !== "built by the code" ? ` [${r.how}]` : ""}`;
const worth = rows.filter((r) => r.worth);
const under = rows.filter((r) => r.worth === false);
const failed = rows.filter((r) => r.error);
console.log(`\nWOULD CACHE — stable prefix clears the model's minimum by the repo's own rule (${worth.length}):`);
console.log(worth.length ? worth.sort((a, b) => b.chars - a.chars).map(line).join("\n") : "  none");
console.log(`\nWOULD NOT CACHE — a marker here is ignored by the provider, and it would not say so (${under.length}):`);
console.log(under.sort((a, b) => b.chars - a.chars).map(line).join("\n"));
if (failed.length) console.log(`\nCOULD NOT MEASURE (${failed.length}):\n${failed.map((r) => `  ${r.file} — ${r.error}`).join("\n")}`);

const listed = new Set(SITES.map((s) => s.file));
const unlisted = neverCache.filter((r) => !listed.has(r.file));
console.log(`\nNOT MEASURED — a file that calls a model, never caches, and is not in SITES (${unlisted.length}):`);
console.log(unlisted.length ? unlisted.map((r) => `  ${r.file}`).join("\n") : "  none");
console.log("\ntokens = characters / 4 (isWorthCaching, src/lib/ai/cached-system.ts); `gr` = Greek text, where that under-counts.");
