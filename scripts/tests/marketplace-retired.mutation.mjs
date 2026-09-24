#!/usr/bin/env node
/*
 * IF SOMEBODY PUTS IT BACK, DOES THE GATE GO RED?
 *
 * The owner asked for this one by name. The rest are the ways the
 * withdrawal could be undone without anyone typing "Marketplace" into
 * the sidebar again: the flag swapped for `hidden` (which leaves it in
 * the command palette), the filter dropped from visibleGroups (same
 * effect, one layer down), the page deleted, the table dropped, the
 * reason blanked.
 *
 * Run: node scripts/tests/marketplace-retired.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/marketplace-retired.test.mjs";
const NAV = "src/lib/sidebar-nav.ts";
const VIS = "src/lib/sidebar-visibility.ts";
const PARSER = "scripts/tests/lib/sidebar-source.mjs";
const PAGE = "src/app/dashboard/marketplace/page.tsx";

const TARGETS = [GATE, NAV, VIS, PARSER, PAGE];

const MUTANTS = [
  {
    // THE ONE ASKED FOR: the row is drawn again.
    name: "the row goes back into the sidebar",
    file: NAV,
    from: "        retired:",
    to: "        notRetired:",
    expect: "the sidebar does not draw it",
  },
  {
    // THE NEAR MISS THAT LOOKS RIGHT. `hidden` takes it off the sidebar
    // and leaves it one keystroke away in the palette — which is moving
    // a capability, not withdrawing it, and is the reason `retired`
    // exists at all.
    name: "retired is downgraded to hidden",
    file: NAV,
    from: "        retired:",
    to: "        hidden: true,\n        unusedReason:",
    expect: "the command palette does not offer it",
  },
  {
    // THE FILTER REMOVED ONE LAYER DOWN, where the nav still reads as
    // correct and every surface offers the row again.
    name: "visibleGroups stops stripping retired rows",
    file: VIS,
    from: "items: group.items.filter((i) => !i.notBuilt && !i.retired),",
    to: "items: group.items.filter((i) => !i.notBuilt),",
    expect: "the command palette does not offer it",
  },
  {
    // THE PARSER GOES BLIND. The flag carries prose rather than `true`,
    // so a parser written for the boolean flags sees none of them — and
    // every gate that reads the config would agree the row is drawn.
    name: "the shared parser stops recognising the flag",
    file: PARSER,
    from: "        retired: /retired:\\s*[\"'`+]/.test(head) || /retired:\\s*$/m.test(head),",
    to: "        retired: /retired:\\s*true/.test(head),",
    expect: "the sidebar does not draw it",
  },
  {
    // THE PAGE DELETED. Retired means withdrawn from the surfaces, not
    // gone: the URL has to keep working.
    name: "the page stops exporting a component",
    file: PAGE,
    from: "export default async function MarketplacePage()",
    to: "async function MarketplacePage()",
    expect: "it still exports a default page component",
  },
  {
    // THE TABLE TAKEN WITH IT. Four other readers break and the nav says
    // nothing.
    name: "the page stops reading agent_templates",
    file: PAGE,
    from: '.from("agent_templates")',
    to: '.from("agent_templates_archive")',
    expect: "it still reads the table",
  },
  {
    // A REASON NOBODY WROTE. "todo" must not pass for one.
    name: "the reason is blanked",
    file: NAV,
    from: "        retired:\n          \"Hidden on 2026-09-24. Trading other people's agent templates is a separate \" +\n          \"product, planned for V8+, not a capability of Ionexa AI itself. The page and \" +\n          \"the agent_templates table both stay: sharing and adopting a template still run \" +\n          \"from the Agents page, and the URL still works for anyone who kept it.\",\n",
    to: "        retired: \"todo\",\n",
    expect: "records why, in words",
  },
  {
    // THE POPULATION EMPTIED. A derived reader list that comes back
    // empty proves nothing and reads as clean.
    name: "the reader scan finds nothing",
    file: GATE,
    from: '})("src");',
    to: '})("src/app/dashboard/marketplace");',
    expect: "the table has readers outside the marketplace page",
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

console.log("marketplace-retired mutations\n");

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
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const mutated = originals.get(m.file).replace(m.from, () => m.to);
    if (mutated === originals.get(m.file)) {
      missed.push({ ...m, why: "the mutation left the file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, mutated);
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
