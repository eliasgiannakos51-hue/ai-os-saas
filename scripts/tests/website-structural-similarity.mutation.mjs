#!/usr/bin/env node
/*
 * THE TWO HALVES OF "TWO SITES OF ONE KIND", AND WHETHER EITHER GATE
 * WOULD NOTICE THEM COMING BACK.
 *
 * The first half is the INSTRUCTION: seven archetypes, six orders each,
 * every order opening with the section its own shape pins. Three of those
 * shapes used to list an order that contradicted their own FIRST line,
 * which is two instructions the model cannot both obey on the one axis
 * the complaint is about.
 *
 * The second half is the MEASUREMENT: the produced page compared against
 * the person's previous one, because the order is an instruction and rule
 * 23 of this project's working rules is that an instruction a model can
 * ignore will be ignored.
 *
 * The seventh mutation is the one to read. It drops the user_id filter
 * from the query that fetches "the previous site" — the note would then
 * be raised against a stranger's page and could NAME IT to the owner.
 * That is not a variety defect; it is a leak, and it is the kind that
 * arrives inside a feature about something else.
 *
 * Run: node scripts/tests/website-structural-similarity.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/website-structural-similarity.test.mjs";
const BUILDER = "src/lib/website-builder.ts";
const ROUTE = "src/app/api/websites/generate/process/route.ts";
const NOTES = "src/lib/website-generation-notes.ts";
const WORKSPACE = "src/components/website-builder/website-builder-workspace.tsx";
const PAIRS = "scripts/website-pairs-check.mjs";
const EL = "messages/el.json";
const TARGETS = [GATE, BUILDER, ROUTE, NOTES, WORKSPACE, PAIRS, EL];

const MUTANTS = [
  {
    // 1. BACK TO THREE ORDERS PER SHAPE. The state the round began in:
    // two strangers of one kind drew the same skeleton a third of the
    // time, and the expected similarity between their pages was 0.660.
    name: "a shape drops back to three orders",
    file: BUILDER,
    from: " · D 1>4>2>3>5 · E 1>2>5>3>4 · F 1>4>3>2>5",
    to: "",
    expect: "every archetype offers all six letters",
  },
  {
    // 2. TWO LETTERS NAME THE SAME PLAN. Six letters, five orders — the
    // defect with extra steps, and invisible to any check that only
    // counts the letters.
    name: "two letters of one shape are the same order relabelled",
    file: BUILDER,
    from: "A 1>2>3>4>5 · B 1>3>2>5>4 · C 2>1>4>3>5",
    to: "A 1>2>3>4>5 · B 1>2>3>4>5 · C 2>1>4>3>5",
    expect: "are the same plan",
  },
  {
    // 2. THE PAGE IS NO LONGER MEASURED, only instructed. Every number in
    // the gate above it stays exactly the same, because they are all
    // about the space of orders rather than about what came back.
    name: "the route stops comparing the produced page to the previous one",
    file: ROUTE,
    from: "          const { similarity } = compareStructure(htmlContent, previousHtml);",
    to: "          const similarity = 0;",
    expect: "the route compares the new page against the previous one",
  },
  {
    // 3. THE THRESHOLD IS RESTATED LOCALLY — the drift this round removed.
    // Two copies agree on the day the second is written.
    name: "the pairs script goes back to its own copy of the threshold",
    file: PAIRS,
    from: "const { SAME_SKELETON, SIMILAR_SKELETON } = structural;",
    to: "const SAME_SKELETON = 0.85;\nconst SIMILAR_SKELETON = 0.7;",
    expect: "the pairs script reads them instead of restating them",
  },
  {
    // 4. THE COLUMN IS TRUSTED. generation_notes is JSON in a database
    // column; a percent of 101 or 92.5 renders as written beside the
    // preview.
    name: "the note parser stops bounding the percentage",
    file: NOTES,
    from: "      isNonNegativeInt(n.percent) &&\n      n.percent > 0 &&\n      n.percent <= 100 &&",
    to: "      typeof n.percent === \"number\" &&",
    expect: "malformed note dropped",
  },
  {
    // 5. THE NOTE IS WRITTEN AND NEVER SHOWN. The column fills up; the
    // person sees nothing; every server-side check stays green.
    name: "the workspace loses its case for the note",
    file: WORKSPACE,
    from: '      case "sameSkeleton":',
    to: '      case "neverHappens":',
    expect: "the workspace has a case for it",
  },
  {
    // 6. ICU QUOTING — the mistake CLAUDE.md records shipping. '{name}'
    // is the literal text {name} in every language, and this key was
    // written in ten at once.
    name: "a locale quote-escapes the placeholder",
    file: EL,
    from: "με το {name}",
    to: "με το '{name}'",
    expect: "el: the placeholders are not quote-escaped",
  },
  {
    // 7. THE PREVIOUS SITE IS ANYBODY'S. Without the owner filter the
    // note compares this page with the most recently generated page ON
    // THE PLATFORM, and then names it. Read the note text: it says "the
    // same structure as X".
    name: "the previous site is fetched without the owner filter",
    file: ROUTE,
    from: '          .select("name, html_content")\n          .eq("user_id", user.id)',
    to: '          .select("name, html_content")',
    expect: "reading the previous site from the same owner only",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 600_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("website-structural-similarity mutations\n");

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
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
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
