#!/usr/bin/env node
/*
 * CAN one-primary-action.test.mjs SEE A SECOND ORANGE BUTTON?
 *
 * The brief asked for exactly this mutation by name — "add a second, it
 * must go red" — so it is the first one here. The rest break the other
 * clauses, in different dimensions, because a suite that only proves the
 * headline check works reports coverage it does not have:
 *
 *   1. a second filled button on a page already at the target
 *   2. a page goes over its recorded baseline
 *   3. the layout chrome grows — the four controls every page pays
 *   4. the instrument: the scan stops seeing layouts, which is the exact
 *      omission that made the Home page look like it had one button
 *   5. the instrument: comments counted as code
 *   6. a glow is added
 *   7. a second piece of gradient text appears
 *
 * Run: node scripts/tests/one-primary-action.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/one-primary-action.test.mjs";
const TEAM = "src/components/team/invite-form.tsx";
const CHAT = "src/components/chat/chat-composer.tsx";
const TOPNAV = "src/components/dashboard/top-nav.tsx";
const HEALTH = "src/components/overview/health-score-card.tsx";

// The mutants edit whichever file each names; TARGETS is what gets
// snapshotted and restored, so a suite killed mid-run cannot leave one
// behind. (It still can if the process is hard-killed — the runner's
// finally does not survive SIGKILL — which is why the workflow added in
// .github/workflows/verify.yml checks `git status` after the suites.)
const TARGETS = [GATE, TEAM, CHAT, TOPNAV, HEALTH];

const MUTANTS = [
  {
    // THE ONE THE BRIEF ASKED FOR, on a page that keeps the rule today.
    name: "a second filled orange button appears on a page that had one",
    file: TEAM,
    from: "<div",
    to: '<button className="bg-orange-500">x</button>\n    <div',
    expect: "dashboard/team/page.tsx",
  },
  {
    // The ratchet, on a page that is already over the target: it must
    // still refuse to get WORSE.
    name: "a page over the target gets one more",
    file: CHAT,
    from: "<div",
    to: '<button className="bg-orange-500">x</button>\n    <div',
    expect: "no page is louder than its baseline",
  },
  {
    // The chrome every dashboard page pays for, pinned rather than
    // floored precisely so this is a decision.
    name: "the layout chrome grows a fifth filled control",
    file: TOPNAV,
    from: "<header",
    to: '<a className="bg-orange-500">x</a>\n    <header',
    expect: "the layout chrome contributes",
  },
  {
    // THE INSTRUMENT. Without the layout chain the Home page measured one
    // filled control while the screen had five — a gate that reads too
    // low is worse than no gate, because it certifies the thing it missed.
    name: "the scan stops walking the layout chain",
    file: GATE,
    from: "    const l = `${parts.slice(0, i).join(\"/\")}/layout.tsx`;",
    to: "    const l = `${parts.slice(0, i).join(\"/\")}/layoutXX.tsx`;",
    expect: "the layout walk finds both layouts",
  },
  {
    // THE INSTRUMENT, second dimension: prose about a class counted as a
    // use of it. Four other gates in this directory had this fault.
    name: "the scan counts comments as code",
    file: GATE,
    from: "  const stripped = stripComments(src);",
    to: "  const stripped = src;",
    expect: "a button inside a // comment is not a button",
  },
  {
    name: "a glow is added",
    file: HEALTH,
    from: "<div",
    to: '<div className="shadow-[0_0_16px_rgba(249,115,22,0.35)]" />\n    <div',
    expect: "accent box-shadows",
  },
  {
    name: "a second piece of gradient text appears",
    file: HEALTH,
    from: "<p className=\"text-sm font-semibold text-foreground\">{title}</p>",
    to: "<p className=\"bg-clip-text text-sm font-semibold text-foreground\">{title}</p>",
    expect: "gradient text",
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
      body: out,
    };
  }
}

console.log("one-primary-action mutations\n");

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
    // The FAIL line, or the detail printed under it, has to mention the
    // thing the mutation broke — a gate that goes red on something else
    // has not caught this.
    const onTarget =
      result.failed.some((f) => f.includes(m.expect)) || (result.body ?? "").includes(m.expect);
    if (!onTarget) {
      missed.push({
        ...m,
        why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"`,
      });
      console.log(`  WRONG   ${m.name}\n          -> ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}`);
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
console.log("Every clause of one-primary-action.test.mjs is load-bearing.");
