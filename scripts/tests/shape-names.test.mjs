#!/usr/bin/env node
/*
 * ONE CATALOGUE, BY NAME, AND EVERY REFERENCE RESOLVES TO IT.
 *
 * The failure this exists for is small and corrosive. Two comments in
 * this repository each numbered the catalogue of shapes for themselves —
 * language-extremes.test.mjs called one of them "the NINTH shape", the
 * working list had it at sixteen — and nothing anywhere could tell a
 * reader which was right, or that they disagreed at all. A number two
 * files disagree about is worse than no number: a reader who follows one
 * to the wrong entry stops trusting the other, and the comments in this
 * project are the most reliable documentation it has.
 *
 * So the shapes live in docs/shapes.md, unnumbered, and a reference has
 * one spelling — `SHAPE: <name>` — which this file resolves against the
 * headings of that document.
 *
 * WHY THE ORDINAL BAN CARRIES AN ALLOWLIST RATHER THAN A CLEVER RULE.
 * "The second shape" is also ordinary English: five comments here
 * enumerate two or four shapes inside their own paragraph and mean
 * nothing global by it. No regex separates those from a catalogue
 * reference — the difference is what the author meant. So they are
 * listed, each with a reason, and the list is checked BOTH ways: an entry
 * whose phrase has left its file is reported as stale, so the allowlist
 * cannot quietly grow into a place where the rule does not apply.
 *
 * Run: node scripts/tests/shape-names.test.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}

const CATALOGUE = "docs/shapes.md";
// THIS FILE EXEMPTS ITSELF, and the reason is worth stating rather than
// hiding: it has to SPELL the phrases it bans — in the allowlist below,
// in the doc comment above, and in the fixtures of section 4 that prove
// the readers work at all. A gate that scanned itself would fail on its
// own evidence. What it costs is that a genuine catalogue reference
// written in here would not be resolved; what it buys is section 4, which
// is the only thing keeping the other sections from being decorative.
const SELF = "scripts/tests/shape-names.test.mjs";

function walk(dir, exts) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === ".git") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((x) => p.endsWith(x))) out.push(p);
  }
  return out;
}

const FILES = [
  ...walk("src", [".ts", ".tsx"]),
  ...walk("scripts", [".mjs", ".js"]),
  ...walk("supabase", [".sql"]),
  ...walk("docs", [".md"]),
  ...["README.md", "CLAUDE.md", "SECURITY.md", "CONTRIBUTING.md"].filter(existsSync),
];

// ---------------------------------------------------------------------
// The two readers. Both are pure functions of text, so section 4 can put
// a fixture through them instead of trusting that they work.
// ---------------------------------------------------------------------

/** A heading or a reference, reduced to the form the two are compared in. */
export const normalise = (s) =>
  s
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[.,;:]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

/** Every shape name docs/shapes.md defines. */
export function headingsIn(markdown) {
  // ONLY THE HEADINGS BELOW THE RULE. Everything above the first `---` is
  // the document explaining itself, and its `##` are prose sections, not
  // shapes. Reading them as names would let `SHAPE: the shapes` resolve.
  const body = markdown.split(/^---$/m).slice(1).join("\n---\n");
  return [...body.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => normalise(m[1]));
}

const ORDINALS =
  "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|" +
  "thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|" +
  "twenty-(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)|" +
  "\\d+(?:st|nd|rd|th)";

/** Every "the Nth shape" in a text, as {line, phrase}. */
export function ordinalsIn(text) {
  const out = [];
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(new RegExp(`\\b(?:${ORDINALS})[- ]shapes?\\b`, "gi"))) {
      out.push({ line: i + 1, phrase: m[0].toLowerCase() });
    }
  });
  return out;
}

/** Every `SHAPE: name` reference in a text, as {line, name}. */
export function referencesIn(text) {
  const out = [];
  text.split("\n").forEach((line, i) => {
    // THE REFERENCE OWNS ITS LINE, after the comment opener and nothing
    // else. The bare marker is too common a string to claim: three files
    // here already write "THE REPORTED SHAPE:" and "SOURCE-SHAPE:" as
    // ordinary English, and reading those as catalogue references made
    // this gate red on six innocent lines the first time it ran.
    //
    // The name then runs to the end of the line, or to a full stop
    // followed by a space, so a comment may keep writing after it.
    const m = /^\s*(?:\/\/+|\*|--|#)?\s*SHAPE:\s*(.+?)\s*$/.exec(line);
    if (m) out.push({ line: i + 1, name: normalise(m[1].split(/\.\s/)[0]) });
  });
  return out;
}

// ---------------------------------------------------------------------
// The ordinals that are ordinary English, each with the reason it is not
// a reference to the catalogue. `phrase` is matched case-insensitively
// against the file, and an entry whose phrase is gone is a failure.
// ---------------------------------------------------------------------
const LOCAL_ENUMERATIONS = [
  {
    file: "scripts/tests/gate-vacuity.test.mjs",
    phrase: "fourth shape",
    why: "numbers four shapes of vacuity WITHIN that file; the global list is not meant",
  },
  {
    file: "scripts/generate-icons.mjs",
    phrase: "fourth shape",
    why: "a fourth literal drawing of an icon, next to three hand-maintained copies",
  },
  {
    file: "src/lib/i18n/message-slices.ts",
    phrase: "first shape",
    why: "the first of two ways a slice can be wrong, both described in that comment",
  },
  {
    file: "src/lib/website-image-placeholders.ts",
    phrase: "second shape",
    why: "the second of the placeholder failures listed above it in the same comment",
  },
  {
    file: "scripts/tests/user-scoped-queries.test.mjs",
    phrase: "second shape",
    why: "the second of two call shapes the scanner has to recognise",
  },
  {
    file: "scripts/tests/user-isolation.mutation.mjs",
    phrase: "first shape",
    why: "the first version of that suite's own `expect` field, not a catalogue entry",
  },
];

console.log("shape-names");

// ---------------------------------------------------------------------
console.log("\n== 1. the catalogue exists and names shapes ==");
// ---------------------------------------------------------------------
check(`${CATALOGUE} is there`, existsSync(CATALOGUE));
const markdown = existsSync(CATALOGUE) ? readFileSync(CATALOGUE, "utf8") : "";
const names = headingsIn(markdown);
// A FLOOR, because "every reference resolves" is trivially true of a
// catalogue with no entries — and section 3 would then pass hardest at
// the moment somebody emptied the file.
check(
  `...and defines ${names.length} shapes by name`,
  names.length >= 15,
  `found ${names.length}: ${names.join(" | ")}`
);
check(
  "...with no two the same, so a reference cannot be ambiguous",
  new Set(names).size === names.length,
  names.filter((n, i) => names.indexOf(n) !== i).join(", ")
);

// ---------------------------------------------------------------------
console.log("\n== 2. the scan reached the repository ==");
// ---------------------------------------------------------------------
check(`files scanned (${FILES.length})`, FILES.length >= 800, `only ${FILES.length}`);
const texts = FILES.map((f) => [f, readFileSync(f, "utf8")]);

// ---------------------------------------------------------------------
console.log("\n== 3. every reference resolves, and no ordinal survives ==");
// ---------------------------------------------------------------------
const known = new Set(names);
const unresolved = [];
let referenceCount = 0;
for (const [file, text] of texts) {
  if (file === CATALOGUE || file === SELF) continue;
  for (const r of referencesIn(text)) {
    referenceCount++;
    if (!known.has(r.name)) unresolved.push(`${file}:${r.line}  "${r.name}"`);
  }
}
check(
  `every SHAPE: reference names a shape in the catalogue (${referenceCount} references)`,
  unresolved.length === 0 && referenceCount >= 2,
  unresolved.length > 0
    ? unresolved.join("\n        ")
    : `only ${referenceCount} references — too few for this check to mean anything`
);

const allowed = new Map(LOCAL_ENUMERATIONS.map((e) => [`${e.file}::${e.phrase}`, e]));
const stray = [];
for (const [file, text] of texts) {
  if (file === CATALOGUE || file === SELF) continue;
  for (const o of ordinalsIn(text)) {
    if (allowed.has(`${file}::${o.phrase}`)) continue;
    stray.push(`${file}:${o.line}  "${o.phrase}"`);
  }
}
check(
  `no comment numbers the catalogue for itself (${LOCAL_ENUMERATIONS.length} local enumerations excused by name)`,
  stray.length === 0,
  `${stray.join("\n        ")}\n        Write SHAPE: <name> instead, or add the file to LOCAL_ENUMERATIONS with a reason.`
);

// AND THE ALLOWLIST IS CHECKED THE OTHER WAY. An excuse for a phrase that
// has left the file is an excuse nobody would notice going stale, which
// is the whole class of defect this project keeps finding in its own
// instruments.
const staleExcuses = LOCAL_ENUMERATIONS.filter((e) => {
  if (!existsSync(e.file)) return true;
  return !readFileSync(e.file, "utf8").toLowerCase().includes(e.phrase);
});
check(
  "...and every excuse still describes something in its file",
  staleExcuses.length === 0,
  staleExcuses.map((e) => `${e.file}: "${e.phrase}" is no longer there`).join(", ")
);
check(
  "...and every excuse says why",
  LOCAL_ENUMERATIONS.every((e) => typeof e.why === "string" && e.why.length > 20),
  LOCAL_ENUMERATIONS.filter((e) => !e.why || e.why.length <= 20).map((e) => e.file).join(", ")
);

// ---------------------------------------------------------------------
console.log("\n== 4. the readers can go red ==");
// ---------------------------------------------------------------------
// EVERY CLAUSE ABOVE RESTS ON THESE THREE FUNCTIONS. If `ordinalsIn`
// quietly matched nothing, section 3 would report a clean repository
// forever, and the failure would look exactly like success.
check(
  "an ordinal reference is found",
  ordinalsIn("// this is THE NINTH SHAPE, obviously").length === 1,
  JSON.stringify(ordinalsIn("// this is THE NINTH SHAPE, obviously"))
);
check(
  "...including the digit form",
  ordinalsIn("// see the 17th shape").length === 1
);
check(
  "...while a sentence with no ordinal is left alone",
  ordinalsIn("// the shape of this check is unusual").length === 0
);
check(
  "a reference is read, and its name normalised",
  referencesIn("  // SHAPE: Stale Anchor.")[0]?.name === "stale anchor",
  JSON.stringify(referencesIn("  // SHAPE: Stale Anchor."))
);
// AND THE THREE INNOCENT LINES THAT WERE READ AS REFERENCES. Kept as a
// fixture rather than a memory: they are real lines from
// agent-run-depth.test.mjs and guard-witnesses.test.mjs, and the reason
// the marker rule is what it is.
const innocent = [
  "// THE REPORTED SHAPE: a value left over from another agent that is LOWER",
  '  "SOURCE-SHAPE: without it a trade shows a symbol of three spaces"',
];
check(
  "...while the word 'shape' ending an ordinary sentence is not a reference",
  innocent.every((l) => referencesIn(l).length === 0),
  JSON.stringify(innocent.map(referencesIn))
);
check(
  "...and a name the catalogue does not define does not match one that it does",
  !known.has(normalise("a shape nobody wrote down")) && known.has(normalise("Stale anchor")),
  `catalogue has: ${[...known].slice(0, 3).join(" | ")}`
);
check(
  "headings above the rule are not shape names",
  !headingsIn("# T\n\n## Prose section\n\n---\n\n## Real shape\n").includes("prose section"),
  JSON.stringify(headingsIn("# T\n\n## Prose section\n\n---\n\n## Real shape\n"))
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
