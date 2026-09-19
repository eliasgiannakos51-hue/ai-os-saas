#!/usr/bin/env node
/*
 * CAN plan-claims.test.mjs SEE A PLAN CLAIM WHAT IT DOES NOT HAVE?
 *
 * The report, from production on 2026-09-19: "every plan shows THE SAME
 * list of 7 features… Free says it has Team collaboration. IT DOES
 * NOT." Rendered live at 390x844 in Greek, the Free card really did
 * read: Website & Automation Builder / AI Memory / Team collaboration /
 * Team seats / Team seats included free / Extended chat memory
 * retention / Custom AI persona name — seven English literals on a
 * Greek page, above the plan's real features.
 *
 * The DATA was right the whole time. What made it a lie on screen was a
 * ✕ at text-muted/50 — 2.25:1 against the panel. So the mutants below
 * put back all three halves: the capability flag flipped, the ✕ faded,
 * and the rows hand-written again.
 *
 * Run: node scripts/tests/plan-claims.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/plan-claims.test.mjs";
const PLANS = "src/lib/billing/plans.ts";
const ROWS = "src/lib/billing/plan-capability-rows.ts";
const SIGNUP = "src/app/signup/signup-flow.tsx";
const SIGNUP_PAGE = "src/app/signup/page.tsx";
const PRICING = "src/app/pricing/page.tsx";
const CSS = "src/app/globals.css";
const CATALOG = "src/lib/billing/feature-catalog.ts";

const TARGETS = [GATE, PLANS, ROWS, SIGNUP, SIGNUP_PAGE, PRICING, CSS, CATALOG, "messages/el.json"];

const MUTANTS = [
  {
    // THE SENTENCE FROM THE REPORT. If the catalog and the plan ever
    // disagree about who has team collaboration, the card is lying to
    // somebody about what they are buying.
    name: "the catalog and the plan disagree about team collaboration",
    file: PLANS,
    from: '  slug: "free",',
    to: '  slug: "free",\n  __mutantUnused: true,',
    edits: [
      {
        file: PLANS,
        from: "      teamCollaboration: false,",
        to: "      teamCollaboration: true,",
      },
    ],
    expect: "agrees with the minPlan declared beside it",
  },
  {
    // THE LEGIBILITY HALF, which is the one that was actually reported.
    name: "the cross goes back to half opacity on the signup card",
    file: SIGNUP,
    // RE-ANCHORED in the same round: the glyph gained mt-0.5 when the
    // long labels were allowed to wrap instead of being truncated.
    from: '<X className="mt-0.5 h-3 w-3 shrink-0 text-muted" aria-hidden="true" />',
    to: '<X className="mt-0.5 h-3 w-3 shrink-0 text-muted/50" aria-hidden="true" />',
    expect: "no cross is drawn at half opacity",
  },
  {
    name: "the cross goes back to half opacity in the comparison table",
    file: PRICING,
    from: '<X className="mx-auto h-4 w-4 text-muted" aria-hidden="true" />',
    to: '<X className="mx-auto h-4 w-4 text-muted/50" aria-hidden="true" />',
    expect: "no cross is drawn at half opacity",
  },
  {
    // ...AND THE THRESHOLD IS REAL. A muted that is too dark to see
    // fails even at full strength.
    name: "the muted token is dimmed until a full-strength cross fails too",
    file: CSS,
    from: "  --muted: 138 138 138;",
    to: "  --muted: 44 44 44;",
    expect: "against the panel (needs 3)",
  },
  {
    name: "the rows stop being derived and become a hand-written list again",
    file: ROWS,
    from: "    return ticks > 0 && crosses > 0;",
    to: "    return [\"websiteBuilder\", \"aiMemory\", \"teamCollaboration\"].includes(entry.id);",
    expect: "the catalog still separates the plans",
  },
  {
    // THE FLOOR. An empty derivation satisfies "no plan claims what it
    // does not have" by claiming nothing.
    name: "the derivation returns nothing",
    file: ROWS,
    from: "  return soldFeatures().filter((entry) => {",
    to: "  return [].filter((entry) => {",
    expect: "the catalog still separates the plans",
  },
  {
    // THE BOUNDARY. The catalog reaches seven process.env readers; in a
    // browser those are undefined and the card quotes a fallback.
    name: "the client component imports the catalog again",
    file: SIGNUP,
    from: 'import { formatNumber } from "@/lib/format-number";',
    to: 'import { formatNumber } from "@/lib/format-number";\nimport { capabilityRowsFor } from "@/lib/billing/plan-capability-rows";',
    expect: "does not reach the catalog itself",
  },
  {
    name: "the second list comes back under the first",
    file: SIGNUP,
    from: "                    </ul>\n\n                  </button>",
    to: "                    </ul>\n                    <ul>{p.features.map((f) => <li key={f.textKey} />)}</ul>\n\n                  </button>",
    expect: "one list per plan card, not two",
  },
  {
    // THE REVERSE DIRECTION, added 2026-09-19 after a Vercel failure
    // named a gate that exists in no commit here. The claim could not
    // be reproduced; the question could, and both directions are held
    // now rather than only the one the minPlan check covers.
    name: "a plan is crossed for something it actually has",
    file: CATALOG,
    from: "    cell: (p) => boolCell(p.capabilities.teamCollaboration),",
    to: '    cell: () => ({ type: "cross" } as const),',
    expect: "shown a cross for something it actually has",
  },
  {
    name: "a zero is dressed up as a number instead of a cross",
    file: CATALOG,
    from: "    cell: (p, locale) => countCell(maxSeatsForPlan(p.slug), locale),",
    to: '    cell: (p, locale) => ({ type: "value", text: String(maxSeatsForPlan(p.slug) ?? 0) } as const),',
    expect: "reads as a number when the number is zero",
  },
  {
    // A ROW WITH NO LABEL. The seven literals this replaced were English
    // in ten locales; the point of deriving them is that the label comes
    // from the catalogue, so a missing one has to be loud.
    name: "a rendered row has no label in Greek",
    file: "messages/el.json",
    from: '"teamCollaboration": "Συνεργασία ομάδας"',
    to: '"teamCollaborationRenamed": "Συνεργασία ομάδας"',
    expect: "exists for every rendered row in all ten locales",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]) };
  }
}

console.log("plan-claims mutations\n");

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
    console.log(`\nBASELINE IS RED — nothing below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    const edits = m.edits ?? [{ file: m.file, from: m.from, to: m.to }];
    const stale = edits.filter((e) => !originals.get(e.file ?? m.file).includes(e.from));
    if (stale.length > 0) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${stale.map((e) => e.file ?? m.file).join(", ")}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const byFile = new Map();
    for (const e of edits) {
      const file = e.file ?? m.file;
      const current = byFile.get(file) ?? originals.get(file);
      byFile.set(file, current.replace(e.from, () => e.to));
    }
    if ([...byFile.entries()].every(([file, text]) => text === originals.get(file))) {
      missed.push({ ...m, why: "the mutation left every file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    for (const [file, text] of byFile) writeFileSync(file, text);
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
      missed.push({ ...m, why: `red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.join(" | ")}`);
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
console.log("Every clause of the gate is load-bearing.");
