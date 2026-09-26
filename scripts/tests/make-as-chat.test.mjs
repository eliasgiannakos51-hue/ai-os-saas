#!/usr/bin/env node
/*
 * CAN EVERY ROW UNDER "MAKE" BE DRIVEN IN WORDS?
 *
 * Run: node scripts/tests/make-as-chat.test.mjs
 *
 * THE RULE, ASKED FOR ON 2026-09-26: "the user knows how to use a chat.
 * So every feature should work like one — you write what you want, the
 * AI understands, you see the result, you say changes in words rather
 * than with buttons."
 *
 * This holds the half of that which is true today and MEASURES the half
 * that is not, with a baseline that may only fall. The measurement is
 * printed in full by scripts/measure-make-steps.mjs; the numbers here
 * are the same ones, derived the same way, so the two cannot disagree.
 *
 * WHAT IS GATED
 *
 *   1. Every row the sidebar DRAWS under Make has a free-text way in.
 *      Not every declared row: Images, Videos and Apps are tracking
 *      logs and Music and Design have no page, so a rule about the way
 *      in has nothing to be about for them. The population is what
 *      sidebarGroups() returns, which is what a person sees.
 *
 *   2. The number of USER INPUTS each primary action waits on, against
 *      a per-row baseline. A chat box waits on one thing — the text is
 *      not empty — and every number above one is a form wearing a
 *      prompt's clothes. The baseline may only go DOWN, so a round that
 *      adds a required chooser fails here rather than in a report
 *      nobody reads.
 *
 * WHAT IS NOT GATED, AND WHY IT IS SAID OUT LOUD
 *
 *   Saying a CHANGE in words. Only the Website Builder has it
 *   (`editText` -> api/websites/edit). Gating a property one of six rows
 *   has would be gating a fact about one file, so it is printed with its
 *   count and the count is floored: it may not fall to zero.
 *
 * A BUSY FLAG IS NOT AN INPUT. `generating`, `running` and `loading`
 * guard a double-press; they are not something the person has to
 * satisfy. Counting them would have made every row look one worse than
 * it is and made the baseline meaningless as a target.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { groupBlocks, itemChunks } from "./lib/sidebar-source.mjs";

let pass = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const { sidebarGroups } = await loadTs("src/lib/sidebar-visibility.ts");
const navSrc = readFileSync("src/lib/sidebar-nav.ts", "utf8");
const groups = groupBlocks(navSrc).map((g) => ({
  heading: g.heading,
  items: itemChunks(g.body).map((i) => ({
    href: i.literalHref ?? i.constantHref ?? "?",
    ...(i.hidden ? { hidden: true } : {}),
    ...(i.notBuilt ? { notBuilt: true } : {}),
    ...(i.ownerOnly ? { ownerOnly: true } : {}),
    ...(i.retired ? { retired: "declared" } : {}),
  })),
}));

console.log("== 0. the population is what the sidebar draws under Make ==");
const make = sidebarGroups(groups, false).find((g) => g.heading === "Make");
check("Make is drawn at all", Boolean(make), "no Make group survived the filters");
const DRAWN = make?.items.map((i) => i.href) ?? [];
check(`${DRAWN.length} rows drawn under Make`, DRAWN.length >= 5,
  "a rule applied to no rows passes for the wrong reason");

// THE BUSY FLAGS, named rather than pattern-matched: a name that merely
// ends in "ing" is not evidence of anything, and `editing` guards a
// different button in the same file.
const BUSY = new Set(["generating", "running", "loading", "creating", "asking", "exporting", "uploading"]);

/** The feature's own folder — src/components/<slug>, nothing shared. */
function screenOf(href) {
  const dir = `src/components/${href.split("/").filter(Boolean).pop()}`;
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".tsx")).map((f) => `${dir}/${f}`) : [];
}

function measure(href) {
  const files = screenOf(href);
  const src = files.map((f) => readFileSync(f, "utf8")).join("\n");
  const m =
    src.match(/onClick=\{(?:\(\) => )?(?:void )?(?:generate|run|create|build|analyse)\b[^}]*\}\s*\n?\s*disabled=\{([^}]*)\}/) ??
    src.match(/disabled=\{(?:generating|running|creating)[^}]*\}/);
  const cond = m ? (m[1] ?? m[0].slice("disabled={".length, -1)) : null;
  const inputs = cond
    ? [...new Set((cond.match(/\b([a-z][A-Za-z0-9]*)\b/g) ?? []))]
        .filter((w) => !BUSY.has(w) && !["trim", "length", "true", "false", "null", "undefined", "status", "completed"].includes(w))
    : [];
  return {
    files,
    textareas: (src.match(/<textarea/g) ?? []).length,
    textInputs: (src.match(/<input\s[^>]*type="text"/g) ?? []).length,
    cond,
    inputs,
  };
}

console.log("\n== 1. every drawn Make row has a free-text way in ==");
const noWords = [];
for (const href of DRAWN) {
  const m = measure(href);
  if (m.files.length === 0) { noWords.push(`${href}: no component folder`); continue; }
  console.log(`        ${href.padEnd(30)} ${m.textareas} textarea, ${m.textInputs} one-line, waits on [${m.inputs.join(", ") || "—"}]`);
  if (m.textareas === 0 && m.textInputs === 0) noWords.push(`${href}: no textarea and no text input`);
}
check("no drawn Make row is unreachable in words", noWords.length === 0, noWords.join("\n        "));

console.log("\n== 2. how many things the primary action waits on ==");
// THE BASELINE IS PER ROW AND MAY ONLY FALL. A single total would let a
// row get worse while another got better, which is exactly the trade
// this is here to refuse. Recorded 2026-09-26 by
// scripts/measure-make-steps.mjs on the tree that shipped it.
const BASELINE = {
  // `!name.trim() || !description.trim()` — a chat box does not ask you
  // to name the thing before it makes it, and the name is derivable
  // from the description by the call that already runs. This is the
  // number V7 §5 names as the cheapest one to move.
  "/dashboard/website-builder": 2,
  // No prompt at all: you create an empty document and type into it.
  // The action waits on a busy flag and nothing else, which is why this
  // is zero and NOT a good sign — section 1 is what says the screen has
  // a text field, and section 3 is where "can it be asked for" lives.
  "/dashboard/documents": 0,
  // ALREADY THE SHAPE: one free-text field, one gate, slide count
  // defaulted.
  "/dashboard/presentations": 1,
  // `platforms.length === 0`, and every platform starts selected — so
  // the gate is unreachable in practice and the checkbox row is still
  // the first thing on the screen.
  "/dashboard/posts": 2,
  // One, after the busy flag is discounted: the operation picker has a
  // default and the two language selects are optional.
  "/dashboard/coding": 1,
  // A FILE is the way in, so no text gates the first result; the
  // follow-up question is a one-line input.
  "/dashboard/data-analysis": 0,
};
const regressions = [];
const unlisted = [];
for (const href of DRAWN) {
  const n = measure(href).inputs.length;
  if (!(href in BASELINE)) { unlisted.push(`${href} (${n})`); continue; }
  if (n > BASELINE[href]) regressions.push(`${href}: ${n}, baseline ${BASELINE[href]}`);
  if (n < BASELINE[href]) console.log(`        IMPROVED  ${href}: ${n}, baseline was ${BASELINE[href]} — lower the baseline in this file`);
}
check("no row waits on more than its baseline", regressions.length === 0, regressions.join("\n        "));
check("every drawn row has a baseline", unlisted.length === 0,
  `${unlisted.join(", ")} — a new Make row needs its number recorded, or this check covers less than it did`);
const stale = Object.keys(BASELINE).filter((h) => !DRAWN.includes(h));
check("...and no baseline names a row that is not drawn", stale.length === 0, stale.join(", "));

console.log("\n== 3. saying a CHANGE in words, which almost nothing has ==");
// REPORTED WITH A FLOOR, not gated. One of six rows has it, so a gate
// would be a gate on one file; a floor is what stops it reaching zero
// while nobody is looking.
const withEdit = DRAWN.filter((href) => {
  const src = screenOf(href).map((f) => readFileSync(f, "utf8")).join("\n");
  return /editText|editPrompt|refine|\/edit"/.test(src);
});
console.log(`        ${withEdit.length} of ${DRAWN.length}: ${withEdit.join(", ") || "none"}`);
check("at least one drawn Make row can be changed by saying so", withEdit.length >= 1,
  "the pattern the whole group is supposed to move towards exists nowhere");

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
