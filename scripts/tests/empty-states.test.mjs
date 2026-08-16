// Empty states: what a list says when it has nothing in it.
//
// THE RULE, from the specification table:
//
//   WHAT it is · WHY I want it · ONE example, CLICKABLE
//
//   BAD   "No entries yet."
//   GOOD  "Log ideas before you forget them. Try: 'A new service for
//          small businesses'"  <- and the example fills the form in
//
// WHY THIS FILE IS A RATCHET AND NOT A WALL.
//
// Every one of the fifteen sites below is currently non-compliant, and a
// hard gate would put the build on the floor until all fifteen are
// rewritten in ten languages. So the failure COUNT is the gate: it starts
// at today's measured number and may only ever go down. The individual
// failures still print, in full, every run — the point is to see them, not
// to hide them behind a green tick.
//
// Lower COMPLIANCE_BASELINE as sites are fixed. Raising it is the one edit
// this file exists to make embarrassing.
//
// THE INVENTORY IS EXPLICIT, NOT DISCOVERED. A heuristic for "is this a
// list?" would be wrong in both directions — it would miss a list built
// from a reduce() and flag a component that maps over two static tabs. The
// table was produced by reading all fifteen; it is the specification, so
// it is written down. Section 4 then catches anything NEW that renders an
// EmptyState without being on it, so the list cannot silently fall behind
// the codebase.
//
// Run: node scripts/tests/empty-states.test.mjs
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

let pass = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

// ---------------------------------------------------------------------------
// The fifteen places a user can land on nothing.
//
//   needsOwnEmpty: true  = the file has a "no search matches" state but NO
//                          state for "you have none at all". Those are two
//                          different sentences: one means "narrow your
//                          query", the other means "here is what this is
//                          for". Serving the first when the second is
//                          meant tells a brand-new user their empty
//                          account is a failed search.
//   perModule:     true  = one string is shared across many modules, so
//                          "an example" cannot be written at all without
//                          splitting it first.
const SITES = [
  { file: "src/components/modules/generic-list.tsx", label: "generic-list (15 modules)", perModule: true },
  { file: "src/components/system-health/error-list.tsx", label: "error-list" },
  { file: "src/components/files/files-workspace.tsx", label: "files-workspace", needsOwnEmpty: true },
  { file: "src/components/integrations/integrations-list.tsx", label: "integrations-list", needsOwnEmpty: true },
  { file: "src/components/timeline/timeline-list.tsx", label: "timeline-list" },
  { file: "src/components/documents/documents-list.tsx", label: "documents-list" },
  { file: "src/components/team/team-members-list.tsx", label: "team-members-list" },
  { file: "src/components/mission/mission-list.tsx", label: "mission-list" },
  { file: "src/components/website-builder/website-builder-workspace.tsx", label: "website-builder" },
  { file: "src/components/ideas/ideas-list.tsx", label: "ideas-list" },
  { file: "src/components/favorites/favorites-list.tsx", label: "favorites-list" },
  { file: "src/components/memory/memory-search.tsx", label: "memory-search" },
  { file: "src/components/agents/agents-workspace.tsx", label: "agents-workspace" },
  { file: "src/components/publishing/published-sites-list.tsx", label: "published-sites-list" },
  { file: "src/components/research/research-workspace.tsx", label: "research-workspace" },
  // FOUND BY SECTION 6, on this file's first run. The specification table
  // was compiled from src/components/ and missed a list living in a page,
  // so the count in it was fifteen and the real number is sixteen. That is
  // the whole reason section 6 exists: an inventory nobody checks against
  // the codebase is a diagnostic that stays green about what it cannot see.
  { file: "src/app/dashboard/marketplace/page.tsx", label: "marketplace" },
];

/** Every <EmptyState>…</EmptyState> block in a file. */
function emptyStateBlocks(src) {
  return [...src.matchAll(/<EmptyState[\s\S]{0,900}?<\/EmptyState>/g)].map((m) => ({
    text: m[0],
    line: src.slice(0, m.index).split("\n").length,
  }));
}

/**
 * A clickable example is a Link, a button or an onClick INSIDE the empty
 * state — not a sentence pointing at a button somewhere else on the page.
 *
 * "use the button above" is the failure this looks for. It is not an
 * example, it is directions to one, and a new user who does not yet know
 * what the thing is for has to guess what to type once they get there.
 */
function hasClickableExample(block) {
  return /<Link\b|<button\b|onClick=/.test(block);
}

/** Latin prose sitting in JSX rather than in messages/*.json. */
function hardcodedEnglish(block) {
  // Text nodes only: strip tags and expressions, then look for two or more
  // ASCII words in a row. A single word could be a product noun; a
  // sentence cannot be anything but untranslated copy.
  const textNodes = block
    .replace(/\{[\s\S]*?\}/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const m = textNodes.match(/[A-Za-z][A-Za-z']*(?:\s+[A-Za-z][A-Za-z']*){2,}/);
  return m ? m[0] : null;
}

// ---------------------------------------------------------------------------
console.log("== 1. every list has an empty state at all ==");
for (const site of SITES) {
  const full = path.join(ROOT, site.file);
  if (!existsSync(full)) {
    check(`${site.label}: file exists`, false, `${site.file} is gone — update SITES`);
    continue;
  }
  const blocks = emptyStateBlocks(readFileSync(full, "utf8"));
  check(`${site.label}: renders an EmptyState`, blocks.length > 0, "a list with nothing in it must say something");
}

// ---------------------------------------------------------------------------
console.log("\n== 2. …with a CLICKABLE example in it ==");
const nonCompliant = [];
for (const site of SITES) {
  const full = path.join(ROOT, site.file);
  if (!existsSync(full)) continue;
  const src = readFileSync(full, "utf8");
  const blocks = emptyStateBlocks(src);
  const clickable = blocks.some((b) => hasClickableExample(b.text));
  const ok = blocks.length > 0 && clickable;
  if (!ok) nonCompliant.push(site.label);
  check(
    `${site.label}: the example is clickable`,
    ok,
    blocks.length === 0
      ? "no EmptyState"
      : `${blocks.length} EmptyState block(s) at line(s) ${blocks.map((b) => b.line).join(", ")}, none containing a Link/button/onClick`
  );
}

// ---------------------------------------------------------------------------
console.log("\n== 3. …and not a word of untranslated English ==");
for (const site of SITES) {
  const full = path.join(ROOT, site.file);
  if (!existsSync(full)) continue;
  const src = readFileSync(full, "utf8");
  for (const block of emptyStateBlocks(src)) {
    const found = hardcodedEnglish(block.text);
    check(
      `${site.label}:${block.line}: no hardcoded prose`,
      found === null,
      found ? `"${found}" — this renders in a Greek UI exactly as written` : ""
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n== 4. the two that only know how to say \"no matches\" ==");
// A "no results for your search" state is not an empty state. A brand-new
// account with zero files is not a failed search, and telling them so is
// the worst first impression this app can make.
for (const site of SITES.filter((s) => s.needsOwnEmpty)) {
  const src = readFileSync(path.join(ROOT, site.file), "utf8");
  const blocks = emptyStateBlocks(src);
  const onlyNoMatches = blocks.length > 0 && blocks.every((b) => /noMatches/.test(b.text));
  check(
    `${site.label}: has an empty state that is not the search one`,
    !onlyNoMatches,
    `all ${blocks.length} EmptyState block(s) render noMatches — there is nothing to show someone with zero of these`
  );
}

console.log("\n== 5. one sentence cannot serve fifteen modules ==");
for (const site of SITES.filter((s) => s.perModule)) {
  const src = readFileSync(path.join(ROOT, site.file), "utf8");
  // The tell: a single fallback key used when a module names none of its
  // own. Fifteen modules sharing "No entries yet" is the exact bad example
  // from the specification, shipped fifteen times.
  const sharedFallback = /emptyKey\s*\?\?\s*"noEntries"/.test(src);
  check(
    `${site.label}: no shared fallback empty string`,
    !sharedFallback,
    'module.emptyKey ?? "noEntries" — every module without its own key shows the same sentence'
  );
}

// ---------------------------------------------------------------------------
console.log("\n== 6. the inventory has not fallen behind the codebase ==");
{
  function walk(dir, out = []) {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.tsx$/.test(e)) out.push(p);
    }
    return out;
  }
  const known = new Set(SITES.map((s) => path.join(ROOT, s.file)));
  const rogue = walk(path.join(ROOT, "src"))
    .filter((f) => !known.has(f))
    .filter((f) => /<EmptyState/.test(readFileSync(f, "utf8")))
    .map((f) => path.relative(ROOT, f));
  check(
    "every file rendering an EmptyState is in the inventory",
    rogue.length === 0,
    `${rogue.join(", ")} — add it to SITES, or this gate cannot see it`
  );
}

// ---------------------------------------------------------------------------
// THE RATCHET.
//
// Measured on the specification table, before any implementation:
//   15 sites, 0 with a clickable example
//    1 hardcoded English string (error-list.tsx)
//    2 with only a search-results state (files, integrations)
//    1 shared fallback across 15 modules (generic-list)
//
// Sixteen sites, not the fifteen the table said: section 6 found
// dashboard/marketplace/page.tsx on the first run.
//
// which is the number below. It may only go DOWN.
const COMPLIANCE_BASELINE = 21;

console.log(
  `\n${failures.length} failing / baseline ${COMPLIANCE_BASELINE}  (${pass} passed)`
);
if (failures.length) {
  console.log("\nSTILL TO FIX:");
  for (const f of failures) console.log(`  - ${f}`);
}

if (failures.length > COMPLIANCE_BASELINE) {
  console.log(
    `\nFAILED: ${failures.length} failures, baseline is ${COMPLIANCE_BASELINE}. An empty state got worse, or a new list shipped without one.`
  );
  process.exit(1);
}
if (failures.length < COMPLIANCE_BASELINE) {
  console.log(
    `\nLOWER THE BASELINE: ${failures.length} failures now, baseline still says ${COMPLIANCE_BASELINE}. Set COMPLIANCE_BASELINE = ${failures.length}.`
  );
  process.exit(1);
}
console.log("\nHOLDING at the baseline — no regression, and nothing fixed yet.");
process.exit(0);
