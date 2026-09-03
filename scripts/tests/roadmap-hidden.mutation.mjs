#!/usr/bin/env node
/*
 * CAN roadmap-hidden.test.mjs SEE THE ROADMAP COMING BACK?
 *
 * The gate holds one decision — the roadmap is unlinked until V7.5 and a
 * comment says so — against the two ways it quietly stops being true: the
 * link is put back with the comment still standing, or the comment is
 * deleted with the page still linked from nowhere. Both are broken here
 * on purpose, along with the page itself and the gate's own scan.
 *
 * FIVE MUTATIONS, FIVE DIMENSIONS:
 *
 *   1. the footer         — the link returns to FOOTER_LINKS
 *   2. any other file     — a literal <Link href="/roadmap"> in the landing page
 *   3. the reason         — the hide comment is deleted while still hidden
 *   4. the page           — /roadmap loses its default export (a 404)
 *   5. the instrument     — the gate's file walk stops finding .tsx files
 *
 * Run: node scripts/tests/roadmap-hidden.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/roadmap-hidden.test.mjs";
const FOOTER = "src/lib/footer-links.ts";
const LANDING = "src/app/page.tsx";
const PAGE = "src/app/roadmap/page.tsx";
const TARGETS = [GATE, FOOTER, LANDING, PAGE];

const MUTANTS = [
  {
    // 1. THE LINK COMES BACK, the way it would: one more entry in the
    // list, next to the comment that says why there is not one.
    name: "the roadmap link is put back into FOOTER_LINKS",
    file: FOOTER,
    from: '  { href: "/pricing", labelKey: "footer.pricing" },\n',
    to: '  { href: "/pricing", labelKey: "footer.pricing" },\n  { href: "/roadmap", labelKey: "footer.roadmap" },\n',
    expect: "hidden while the comment says",
  },
  {
    // 2. NOT ONLY THE FOOTER. A link written straight into the landing
    // page's JSX bypasses the list entirely, and the gate scans the whole
    // of src/ precisely so this is not a way round it.
    name: "a literal link to /roadmap appears in the landing page",
    file: LANDING,
    from: '            href="/login"\n',
    to: '            href="/roadmap"\n',
    expect: "hidden while the comment says",
  },
  {
    // 3. THE REASON IS DELETED. The page is still linked from nowhere,
    // and now nothing says that is deliberate.
    name: "the hide comment is removed while the roadmap stays hidden",
    file: FOOTER,
    from: "Κρυμμένο μέχρι το V7.5",
    to: "Removed",
    expect: "linked, since the comment",
  },
  {
    // 4. THE PAGE IS GONE IN ALL BUT NAME. A route file with no default
    // export is a 404, which is deletion with extra steps — and the
    // instruction was to keep the page.
    name: "the roadmap page loses its default export",
    file: PAGE,
    from: "export default async function RoadmapPage()",
    to: "async function RoadmapPage()",
    expect: "exports a page",
  },
  {
    // 5. THE INSTRUMENT. A walk that finds no files finds no links, and
    // "nothing links to it" is then a statement about an empty list.
    name: "the gate's file walk stops matching .ts/.tsx",
    file: GATE,
    from: "else if (/\\.(ts|tsx)$/.test(entry)) out.push(full);",
    to: "else if (/\\.(ts|tsx)XX$/.test(entry)) out.push(full);",
    expect: "the scan found the app",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
    };
  }
}

console.log("roadmap-hidden mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({
        ...m,
        why: `the gate went red, but on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"`,
      });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 4).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause in roadmap-hidden.test.mjs is load-bearing.");
