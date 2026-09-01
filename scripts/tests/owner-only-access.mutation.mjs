// EVERY CLAUSE OF THE OWNER-ONLY NAVIGATION RULE, BROKEN ON PURPOSE.
//
// owner-only-access.test.mjs had no mutation suite at all, which for a
// gate about who can reach what is the wrong thing to be missing.
//
// The section this covers exists because the product was correct BY
// ABSENCE rather than by rule: four dashboard pages refuse a non-owner
// with notFound(), and exactly one of them is marked `ownerOnly` in the
// navigation config. The other three are safe only because nobody has
// added them to it — and the command palette deliberately does not filter
// `hidden`, so hiding a page from the sidebar leaves it one keystroke
// away rather than out of reach.
//
// Run: node scripts/tests/owner-only-access.mutation.mjs
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/owner-only-access.test.mjs";

function runGate() {
  try {
    execFileSync("node", [GATE], { stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

const MUTATIONS = [
  {
    name: "the one owner-only nav item loses its mark",
    file: "src/lib/sidebar-nav.ts",
    from: "        ownerOnly: true,\n",
    to: "",
    expect: "either absent from the navigation or marked ownerOnly",
  },
  {
    name: "the palette stops filtering by role, putting every owner page one keystroke away",
    file: "src/components/dashboard/command-palette.tsx",
    from: "  visibleGroups(ALL_SIDEBAR_GROUPS, isOwner).flatMap((group) => group.items);",
    to: "  ALL_SIDEBAR_GROUPS.flatMap((group) => group.items);",
    expect: "command-palette.tsx filters through visibleGroups",
  },
  {
    name: "the sidebar reimplements the role filter instead of composing it",
    file: "src/lib/sidebar-visibility.ts",
    from: "  return visibleGroups(groups, isOwner)",
    to: "  return groups",
    expect: "sidebarGroups is built ON visibleGroups",
  },
  {
    name: "an owner-only page stops refusing",
    file: "src/app/dashboard/system-health/page.tsx",
    from: "  if (!isAdminEmail(user.email)) notFound();",
    to: "  void isAdminEmail;",
    expect: "pages that refuse a non-owner",
  },
  // ---- THE INSTRUMENT'S OWN CLAUSES ----
  {
    // WHAT THIS MUTATES, AND WHY NOT THE OBVIOUS LINE.
    //
    // The obvious one is the SCAN's own call —
    //   const src = stripComments(readFileSync(p, "utf8"))
    //         ->   const src = readFileSync(p, "utf8")
    // — and it was tried, and it survived, correctly. The census that
    // call feeds is a FLOOR, which inflating cannot break, and no page in
    // the tree today quotes the refusal in its prose. Reporting it as
    // caught would have needed a second thing to be wrong at the same
    // time.
    //
    // So the mutation goes where the stripping IS load-bearing: the
    // sample the gate hands the classifier, which contains the hazard by
    // construction rather than by luck.
    name: "the classifier stops being given the stripped sample, so prose reads as a refusal",
    file: GATE,
    from: "    check(\"a page that only QUOTES the refusal is not counted as making it\",\n      looks(stripComments(commented)) === false);",
    to: "    check(\"a page that only QUOTES the refusal is not counted as making it\",\n      looks(commented) === false);",
    expect: "only QUOTES the refusal is not counted",
  },
  {
    name: "the refusing-page scan matches nothing, so the rule is vacuous",
    file: GATE,
    from: "    if (!/if \\(!isAdminEmail\\([^)]*\\)\\)\\s*(notFound\\(\\)|redirect\\()/.test(src)) continue;",
    to: "    if (!/if \\(!isAdminEmailNope\\(/.test(src)) continue;",
    expect: "pages that refuse a non-owner",
  },
];

console.log("owner-only-access mutations\n");
const base = runGate();
if (!base.green) {
  console.log(`baseline is RED — fix that first:\n  ${base.failed.join("\n  ")}`);
  process.exit(1);
}
console.log("baseline: the gate is GREEN on the unmutated tree");

let caught = 0;
const survivors = [];
const missed = [];
for (const m of MUTATIONS) {
  const before = readFileSync(m.file, "utf8");
  if (!before.includes(m.from)) {
    missed.push(`${m.name} — ANCHOR NOT FOUND in ${m.file}`);
    continue;
  }
  if (before.split(m.from).length - 1 !== 1) {
    missed.push(`${m.name} — anchor appears more than once in ${m.file}`);
    continue;
  }
  writeFileSync(m.file, before.replace(m.from, () => m.to));
  const result = runGate();
  writeFileSync(m.file, before);

  if (result.green) {
    survivors.push(`${m.name} (${m.file}) — the gate stayed GREEN`);
    console.log(`  SURVIVED  ${m.name}`);
  } else if (m.expect && !result.failed.some((f) => f.includes(m.expect))) {
    survivors.push(`${m.name} — went red, but on ${JSON.stringify(result.failed)}, not "${m.expect}"`);
    console.log(`  WRONG CHECK  ${m.name}`);
  } else {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> by ${m.expect}`);
  }
}

console.log("");
if (!runGate().green) {
  console.log("baseline: the gate is RED on the restored tree — a mutation was not put back.");
  process.exit(1);
}
console.log("baseline: the gate is green again on the restored tree\n");
console.log(`${caught} of ${MUTATIONS.length} mutations caught.`);
if (missed.length > 0) {
  console.log("\nMISSED ANCHORS:");
  for (const s of missed) console.log(`  - ${s}`);
}
if (survivors.length > 0) {
  console.log("\nSURVIVORS:");
  for (const s of survivors) console.log(`  - ${s}`);
}
if (missed.length > 0 || survivors.length > 0) process.exit(1);
console.log("Every clause of the owner-only navigation rule is load-bearing.");
