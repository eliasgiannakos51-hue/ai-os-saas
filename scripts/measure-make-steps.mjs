#!/usr/bin/env node
/**
 * HOW FAR IS EACH MAKE FEATURE FROM A CHAT BOX?
 *
 * Run: node scripts/measure-make-steps.mjs
 *
 * THE ASK, 2026-09-26: "every feature should work like a simple AI chat
 * — you write what you want, the AI does it; you say a change in words,
 * it changes." Before rewriting five workspaces, this counts what is
 * actually in the way of that, per feature, so the rewrite is aimed at
 * something measured rather than at an impression.
 *
 * WHAT IT COUNTS, and why each one:
 *
 *   free-text     a <textarea>, counted apart from a one-line
 *                 <input type="text">, because the two are not the same
 *                 claim. Data Analysis asks its follow-up question
 *                 through a one-line input and that IS driving it in
 *                 words; the Website Builder's required Website Name is
 *                 also a one-line input and is not. Both numbers are
 *                 printed and neither is added to the other.
 *   gates         the distinct pieces of state the primary action's
 *                 `disabled=` reads. Every one of them is something the
 *                 person must satisfy before anything happens, and a
 *                 chat box has exactly one: the text.
 *   choosers      <select> and checkbox groups on the way in. A default
 *                 makes one optional, which is why they are counted
 *                 apart from the gates rather than added to them.
 *   words after   a second free-text field that changes the RESULT.
 *                 This is the half of "like a chat" that is not about
 *                 the first screen, and the half nearly nothing has.
 *   clicks        how many presses between arriving and a result, for
 *                 somebody who already knows what they want to say:
 *
 *                   + 1  the field is behind a button ("New project")
 *                   + 1  the field is not focused on arrival
 *                   + 1  the action button itself
 *
 *                 A chat box is ONE: you land, you type, you press.
 *                 Typing is not a click and the count says so — the
 *                 question asked was "how many clicks to a result",
 *                 not how much work it is to describe a website.
 *
 * IT REPORTS AND DOES NOT GATE. scripts/tests/make-as-chat.test.mjs is
 * the gate, and it holds the one property that is true of every drawn
 * row today (a free-text primary input) plus a baseline on the rest —
 * the numbers here are the argument for where that baseline goes next.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { groupBlocks, itemChunks } from "./tests/lib/sidebar-source.mjs";

const { loadTs } = await import("./tests/load-ts.mjs");
const vis = await loadTs("src/lib/sidebar-visibility.ts");

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
const make = vis.sidebarGroups(groups, false).find((g) => g.heading === "Make");
if (!make) { console.log("no Make group is drawn"); process.exit(2); }

/**
 * THE FEATURE'S OWN SCREEN — its folder under src/components, and
 * nothing shared.
 *
 * TWO WRONG VERSIONS BEFORE THIS ONE, in opposite directions, and both
 * are worth recording because they are the two ways this measurement
 * can lie.
 *
 *   "The biggest component the page imports" reported Documents as
 *   having no free-text field: it picked documents-list.tsx out of four
 *   and the question is about the screen, not about one file.
 *
 *   "Every folder the page imports from" swept in the sidebar, the
 *   command palette and the top nav — shared chrome on every dashboard
 *   page — and credited Presentations with eighteen components and a
 *   second textarea that belongs to the chat. A count that includes the
 *   furniture rises when the furniture changes and says nothing about
 *   the feature.
 *
 * So: src/components/<slug>, where slug is the row's own last path
 * segment, plus any direct import of the page that already lives there.
 * A row whose folder is missing is REPORTED as unmeasured rather than
 * measured as zero, which is the distinction the first version lost.
 */
function screenOf(href) {
  const slug = href.split("/").filter(Boolean).pop();
  const dir = `src/components/${slug}`;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => `${dir}/${f}`);
}

/** The `disabled=` of the action that produces the thing. */
function primaryAction(src) {
  // The producing handler is the one the page's own verb names; the
  // button that calls it carries the condition. Matched on the call
  // rather than on a label, which is translated.
  const m = src.match(/onClick=\{(?:\(\) => )?(?:void )?(generate|run|create|build|analyse)\b[^}]*\}\s*\n?\s*disabled=\{([^}]*)\}/);
  if (m) return { handler: m[1], cond: m[2] };
  // THE FALLBACK RETURNED THE ALTERNATION AND NOT THE CONDITION, which
  // reported the Website Builder as waiting on one thing (`generating`)
  // when it waits on three. The whole braces' contents, less the
  // braces.
  const m2 = src.match(/disabled=\{(?:generating|running|creating)[^}]*\}/);
  return m2 ? { handler: "(inferred)", cond: m2[0].slice("disabled={".length, -1) } : null;
}

const STATE = /\b([a-z][A-Za-z0-9]*)\b/g;
const NOISE = new Set(["trim", "length", "true", "false", "null", "undefined", "status", "completed"]);
// A BUSY FLAG IS NOT AN INPUT, and this file and its gate have to agree
// about that (2026-09-27). `generating`, `running` and `loading` guard a
// double press; they are not something a person has to satisfy. This
// script counted them and scripts/tests/make-as-chat.test.mjs did not,
// so the two printed different numbers for the same screen — two
// instruments disagreeing about one measurement, which is the shape
// this repository keeps a catalogue of. Named, not pattern-matched: a
// name ending in "ing" is not evidence, and `editing` guards a
// different button in the same file.
const BUSY = new Set(["generating", "running", "loading", "creating", "asking", "exporting", "uploading"]);

console.log("how far each drawn MAKE row is from a chat box\n");
const rows = [];
for (const item of make.items) {
  const files = screenOf(item.href);
  if (files.length === 0) { rows.push({ href: item.href, files: [] }); continue; }
  const raw = files.map((f) => readFileSync(f, "utf8")).join("\n");
  // COMMENTS STRIPPED BEFORE ANY DETECTION, and this file learned it the
  // hard way on its first run after the fix it was measuring. The
  // "field behind a button" detector looks for
  // `useState(initialWebsites.length === 0)`, the commit that removed
  // that line left a comment SAYING what it removed, and the detector
  // found the comment and reported the click still being paid. Sixth
  // time in one session that a check here matched its own commentary.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const action = primaryAction(src);
  const gates = action
    ? [...new Set((action.cond.match(STATE) ?? []).filter((w) => !NOISE.has(w) && !BUSY.has(w)))]
    : [];
  // THE FIELD BEHIND A BUTTON. website-builder starts with
  // `showForm = useState(initialWebsites.length === 0)`, so somebody
  // who has made one site before has to press "New project" before the
  // description exists at all — a click that a first-time visitor does
  // not pay and that therefore never shows up in a demo.
  const behindAButton = /useState\(\s*initial\w+\.length === 0\s*\)/.test(src);
  const focused = /autoFocus/.test(src);
  rows.push({
    href: item.href,
    files,
    behindAButton,
    focused,
    clicks: (behindAButton ? 1 : 0) + (focused ? 0 : 1) + 1,
    textareas: (src.match(/<textarea/g) ?? []).length,
    textInputs: (src.match(/<input\s[^>]*type="text"/g) ?? []).length,
    selects: (src.match(/<select/g) ?? []).length,
    checkboxes: (src.match(/type="checkbox"/g) ?? []).length,
    cond: action?.cond.replace(/\s+/g, " ").trim() ?? "(not found)",
    gates,
  });
}

for (const r of rows) {
  if (r.files.length === 0) { console.log(`  ${r.href.padEnd(30)} no component found`); continue; }
  console.log(`  ${r.href}`);
  console.log(`      ${r.files.length} component(s): ${r.files.map((f) => f.split("/").pop()).join(", ")}`);
  console.log(
    `      free-text        : ${r.textareas} textarea, ${r.textInputs} one-line` +
      (r.textareas === 0 && r.textInputs === 0 ? "   <- cannot be driven in words at all" : "")
  );
  console.log(`      choosers in      : ${r.selects} select, ${r.checkboxes} checkbox`);
  console.log(`      the action waits on: ${r.cond}`);
  console.log(`      ...which is ${r.gates.length} thing(s): ${r.gates.join(", ") || "—"}`);
  console.log(
    `      clicks to a result: ${r.clicks}` +
      `  (${r.behindAButton ? "+1 field behind a button, " : ""}${r.focused ? "focused on arrival" : "+1 to focus the field"}, +1 the button)`
  );
}

const withText = rows.filter((r) => r.files.length && r.textareas > 0).length;
const withAny = rows.filter((r) => r.files.length && (r.textareas > 0 || r.textInputs > 0)).length;
const measured = rows.filter((r) => r.files.length).length;
console.log(`\n  ${withText} of ${measured} drawn MAKE rows have a textarea; ${withAny} have a free-text field of any kind.`);
console.log(`  user inputs the primary action waits on: ${rows.filter((r) => r.files.length).map((r) => r.gates.length).join(", ")}`);
console.log(`  clicks to a result           : ${rows.filter((r) => r.files.length).map((r) => r.clicks).join(", ")}`);
console.log("  (busy flags discounted — the same rule scripts/tests/make-as-chat.test.mjs uses,");
console.log("   so the two cannot print different numbers for one screen)");
console.log("\n  A chat box has one gate: the text is not empty. Anything above one");
console.log("  is a form pretending to be a prompt.");
