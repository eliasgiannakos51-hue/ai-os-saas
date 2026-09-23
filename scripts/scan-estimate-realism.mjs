#!/usr/bin/env node
/*
 * DOES THE NUMBER ON THE SCREEN RESEMBLE THE BILL?
 *
 * lib/billing/estimate.ts holds one profile per action: how much input
 * it expects, and how much OUTPUT. The output half is the expensive one
 * — Anthropic charges five times more for it — and it is the half that
 * is guessed rather than measured.
 *
 * THE FAILURE IT PRODUCES IS NOT "a slightly wrong number". The same
 * figure is shown to the user before they press AND used to size the
 * credit hold, so a profile that understates the output by six times
 * shows "3 credits", reserves 4, and settles 19. The affordability
 * check passed against 4. estimate.ts's own header says this in the
 * past tense about the Website Builder: "reserved far less than it went
 * on to cost, which defeats the point of reserving."
 *
 * HOW THIS ASKS. Each profile names an action; the route that estimates
 * that action is found by its literal, and the output CEILING of the
 * call it makes is read out of that route and the modules it imports —
 * `maxTokens: 8_000`, or a named constant defined in one of them. The
 * profile's own expected output is `baseOutputChars / CHARS_PER_TOKEN`.
 *
 * A ceiling is not a prediction: a call allowed 8,000 tokens usually
 * writes fewer. So the finding is not "these differ" but "the profile
 * expects less than a SMALL FRACTION of what the call may produce",
 * which is the shape that cannot be explained by a model being brief.
 *
 * IT REPORTS; IT DOES NOT GATE. The right expected output is a
 * measurement against real generations, and nobody here has one for
 * every action. What this can say is which profiles are not even in the
 * right order of magnitude.
 *
 * Run: node scripts/scan-estimate-realism.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { loadTs } from "./tests/load-ts.mjs";

const estimate = await loadTs("src/lib/billing/estimate.ts");
const PROFILES = estimate.ACTION_PROFILES;
const CHARS_PER_TOKEN = estimate.CHARS_PER_TOKEN;

const sources = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) sources.push(p);
  }
};
walk("src");
const text = new Map(sources.map((f) => [f, readFileSync(f, "utf8")]));

/**
 * Every numeric token ceiling a file sets.
 *
 * A NAMED CONSTANT IS RESOLVED INSIDE THE CALLER'S OWN CLOSURE, not
 * across the tree. The first version searched every file in src for
 * `MAX_TOKENS = ...` and took whichever it found first, so three
 * unrelated actions were all reported against one module's 2,048 and
 * `agentBuild` was measured against Deep Research's 8,000. A scan that
 * attributes a number to the wrong feature produces findings nobody can
 * act on, which is worse than producing none.
 */
function ceilingsIn(file, scope) {
  const src = text.get(file) ?? "";
  const out = [];
  for (const m of src.matchAll(/(?:maxTokens|max_tokens)\s*:\s*([0-9_]+)/g)) {
    out.push({ value: Number(m[1].replace(/_/g, "")), via: "literal", from: file });
  }
  for (const m of src.matchAll(/(?:maxTokens|max_tokens)\s*:\s*([A-Z][A-Z0-9_]*)/g)) {
    const name = m[1];
    for (const candidate of scope) {
      const def = (text.get(candidate) ?? "").match(
        new RegExp(`${name}\\s*(?::\\s*number)?\\s*=\\s*([0-9_]+)`)
      );
      if (def) {
        out.push({ value: Number(def[1].replace(/_/g, "")), via: name, from: candidate });
        break;
      }
    }
  }
  return out;
}

/** One hop of local imports, which is where a route's generator lives. */
function closureOf(file) {
  const seen = new Set([file]);
  const src = text.get(file) ?? "";
  for (const m of src.matchAll(/from "@\/([^"]+)"/g)) {
    for (const ext of [".ts", ".tsx"]) {
      const candidate = `src/${m[1]}${ext}`;
      if (text.has(candidate)) seen.add(candidate);
    }
  }
  return [...seen];
}

const rows = [];
for (const [key, profile] of Object.entries(PROFILES)) {
  // THE CALLER IS THE FILE THAT NAMES THIS ACTION AS estimateForAction's
  // FIRST ARGUMENT. The first version accepted any file that mentioned
  // the string and also called estimateForAction somewhere, which made
  // every page listing several actions a caller of all of them.
  const callerRe = new RegExp(`estimateForAction\\(\\s*"${key}"`);
  const callers = sources.filter((f) => callerRe.test(text.get(f) ?? ""));
  const ceilings = [];
  for (const caller of callers) {
    const scope = closureOf(caller);
    for (const file of scope) ceilings.push(...ceilingsIn(file, scope));
  }
  const ceiling = ceilings.length ? Math.max(...ceilings.map((c) => c.value)) : null;
  const via = ceiling === null ? null : ceilings.find((c) => c.value === ceiling)?.via;
  // WHAT THE PROFILE EXPECTS AT A REALISTIC INPUT, not at zero.
  //
  // The first version used baseOutputChars alone and flagged four
  // profiles that scale with input — textAction, codeAssist, importPaste
  // and meetingAnalyse all look starved at an empty prompt and are fine
  // at a real one. A scan that measures the wrong quantity produces a
  // list nobody can act on, which is the failure docs/shapes.md records
  // for the symbol claims at 4% precision.
  //
  // 1,200 characters is a paragraph or two: a brief, a question, a
  // pasted table. It is stated rather than tuned, and the ratio is
  // printed at both ends so a reader can see which term dominates.
  const REALISTIC_INPUT_CHARS = 1200;
  //
  // AND THE AUXILIARY CALLS COUNT. `automationCreate` has
  // baseOutputChars: 0 and models its whole output in one auxiliary
  // call, because the action it estimates IS a clarification pre-check
  // rather than a generation. Ignoring that term reported it at 500x
  // and it is the profile's most honest entry.
  const expectedChars =
    profile.baseOutputChars + REALISTIC_INPUT_CHARS * (profile.outputCharsPerInputChar ?? 0);
  const auxTokens = (profile.auxiliaryCalls ?? []).reduce((s, c) => s + (c.outputTokens ?? 0), 0);
  const expectedTokens = Math.round(expectedChars / CHARS_PER_TOKEN) + auxTokens;
  const baseTokens = Math.round(profile.baseOutputChars / CHARS_PER_TOKEN);
  rows.push({ key, callers, ceiling, via, expectedTokens, baseTokens, ratio: ceiling ? ceiling / Math.max(1, expectedTokens) : null });
}

console.log("DOES THE ESTIMATE RESEMBLE THE BILL? — output side\n");
console.log(`  ${Object.keys(PROFILES).length} action profiles; ${CHARS_PER_TOKEN} chars per token\n`);

const measured = rows.filter((r) => r.ceiling !== null);
const unmeasured = rows.filter((r) => r.ceiling === null);
console.log(`  ${measured.length} profiles reach a call whose output ceiling is readable`);
console.log(`  ${unmeasured.length} do not, and are listed at the end rather than assumed fine\n`);

// THE LINE. A ceiling four times the expectation is ordinary — models
// are usually briefer than their limit. Ten times is not something a
// brief model explains.
const SUSPICIOUS_RATIO = 8;
const bad = measured.filter((r) => r.ratio >= SUSPICIOUS_RATIO).sort((a, b) => b.ratio - a.ratio);

console.log(`== profiles expecting less than a ${SUSPICIOUS_RATIO}th of what the call may write (${bad.length}) ==\n`);
for (const r of bad) {
  console.log(
    `  ${r.key.padEnd(24)} expects ${String(r.expectedTokens).padStart(5)} out (base ${String(r.baseTokens).padStart(5)}) · ceiling ${String(r.ceiling).padStart(5)} (${r.via}) · ${r.ratio.toFixed(1)}x`
  );
  console.log(`      ${r.callers.map((c) => c.replace("src/app/api/", "api/")).join(", ") || "(no caller found)"}`);
}

console.log(`\n== the rest, for contrast ==\n`);
for (const r of measured.filter((r) => r.ratio < SUSPICIOUS_RATIO).sort((a, b) => b.ratio - a.ratio)) {
  console.log(`  ${r.key.padEnd(24)} expects ${String(r.expectedTokens).padStart(5)} out · ceiling ${String(r.ceiling).padStart(5)} · ${r.ratio.toFixed(1)}x`);
}

if (unmeasured.length) {
  console.log(`\n== no readable ceiling (${unmeasured.length}) ==`);
  console.log("   the caller was not found, or it sets no maxTokens this can read\n");
  for (const r of unmeasured) console.log(`  ${r.key.padEnd(24)} expects ${r.expectedTokens} out`);
}

console.log(
  "\n  REPORTS; DOES NOT GATE. A ceiling is a limit, not a prediction, and\n" +
    "  the right expected output is a measurement against real generations.\n" +
    "  What this can say is which profiles are not in the right order of\n" +
    "  magnitude — and the number on the screen is the number reserved."
);
