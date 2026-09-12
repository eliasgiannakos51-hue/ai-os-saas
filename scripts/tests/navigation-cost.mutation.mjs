#!/usr/bin/env node
/*
 * "ΟΙ ΜΕΤΑΒΑΣΕΙΣ ΜΕΤΑΞΥ ΣΕΛΙΔΩΝ ΕΙΝΑΙ ΑΡΓΕΣ" — AS A RATCHET.
 *
 * navigation-latency.prodtest.mjs found the cause with a real build, a real
 * browser and a mock database at 25ms: Home was 313ms of TTFB behind 103
 * queries and an eleven-deep serial chain. That measurement needs a port, a
 * browser and four minutes. navigation-cost.test.mjs is the half that runs
 * in the build gate — it cannot measure milliseconds, so it measures the
 * two things that produced them: work in the shared layout, and awaits in
 * a row.
 *
 * A ratchet is only worth what its ceilings are worth, and the way this one
 * fails is not somebody raising a number. It is a query slipped into the
 * layout — which is one query on every page in the product at once — or an
 * await chain the counter cannot see. The mutants below are each of those.
 *
 * Run: node scripts/tests/navigation-cost.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/navigation-cost.test.mjs";
const LAYOUT = "src/app/dashboard/layout.tsx";
const BRIDGE = "src/components/achievements/achievement-unlock-bridge.tsx";
const OVERVIEW = "src/app/dashboard/overview/page.tsx";
const CSS = "src/app/globals.css";
const SKELETON = "src/components/dashboard/route-skeleton.tsx";

const MUTANTS = [
  {
    // THE ACHIEVEMENT BATTERY, BACK IN THE LAYOUT. This is the original
    // finding: a layout wraps every route beneath it, so one await here is
    // one await on every page in the product.
    name: "the achievement check is awaited in the shared layout again",
    file: LAYOUT,
    from: "export default async function",
    to: "async function checkAndUnlockAchievements() {\n  return null;\n}\n\nexport default async function",
    expect: "not awaited in the layout",
  },
  {
    // THE BRIDGE COMPETES WITH HYDRATION. Moving the call off the layout
    // is only half the fix; firing it immediately puts the same work on
    // the main thread while the page is still becoming interactive.
    name: "the bridge stops waiting for an idle moment",
    file: BRIDGE,
    from: "requestIdleCallback",
    to: "setTimeout",
    all: true,
    expect: "behind requestIdleCallback",
  },
  {
    // AND ON EVERY PAGE LOAD. Without the rate limit the check runs on
    // each navigation — cheaper than the layout version, and still a
    // request per click for something that changes a few times a month.
    name: "the achievement re-check stops being rate-limited",
    file: BRIDGE,
    from: "        if (Date.now() - last < RECHECK_AFTER_MS) return;",
    to: "",
    expect: "not on every page load",
  },
  {
    // HOME'S FOURTEEN MODULES, TWO AWAITS EACH. The reads are independent
    // and were awaited in sequence; one wave is the difference between 103
    // queries in a chain and 103 queries at once.
    name: "Home stops fanning its module reads out in one wave",
    file: OVERVIEW,
    from: "await Promise.allSettled([",
    to: "await Promise.resolve([",
    all: true,
    expect: "one wave, not two per module",
  },
  {
    // THE REDIRECTED ACCOUNT PAYS ANYWAY. The onboarding check has to come
    // first, or an account that is about to be redirected still runs every
    // query on the page before finding out.
    //
    // THE MUTANT REMOVES THE REDIRECT, and finding one that was a defect
    // took three tries — each recorded, because each says something about
    // what the check was actually asserting.
    //
    //   editing the "ONE WAVE" marker moves the gate's indexOf and nothing
    //   else; mutation-anchors.test.mjs reported it as prose and was right.
    //
    //   renaming the table in the first query left the fallback retry
    //   below it still reading user_onboarding, so the page genuinely did
    //   read onboarding first — the gate was right to stay green.
    //
    // What makes a redirected account do no work is the redirect() that
    // leaves the function before the wave. Deleting it means every query
    // on the page runs for somebody who will never see it, and the check
    // now asserts that ordering rather than the read's.
    name: "an un-onboarded account runs the whole page before being redirected",
    file: OVERVIEW,
    from: '    redirect("/onboarding");',
    to: "",
    expect: "the onboarding check stays first",
  },
  {
    // AN ANIMATION ADDED TO EVERY CLICK. The wrapper starts at opacity 0,
    // so this duration is on top of every click-to-content time in the
    // app — a "nicer" 600ms entrance is a 600ms regression.
    name: "the route entrance animation is slowed to 600ms",
    file: CSS,
    from: "  animation: page-enter 160ms cubic-bezier(0.22, 1, 0.36, 1) backwards;",
    to: "  animation: page-enter 600ms cubic-bezier(0.22, 1, 0.36, 1) backwards;",
    expect: "route entrance animation",
  },
  {
    // A LONG SLIDE INSTEAD OF A RISE. The same cost in a different
    // currency: content that is still travelling is content you cannot
    // read yet.
    name: "the page entrance becomes a 60px slide",
    file: CSS,
    from: "    transform: translateY(8px);",
    to: "    transform: translateY(60px);",
    expect: "not a long slide",
  },
  {
    // A SKELETON THAT CLAIMS THINGS. A fallback showing counts or titles
    // is guessing at content it has not loaded; when the real page differs
    // the screen changes twice.
    name: "the route skeleton stops being announced to a screen reader",
    file: SKELETON,
    from: 'role="status"',
    to: 'data-role="status"',
    expect: "announced to a screen reader",
  },
  {
    // THE FALLBACK STOPS BEING PAGE-SHAPED. A skeleton at a different
    // width than the page it precedes makes the content jump sideways the
    // moment it arrives.
    name: "the skeleton no longer matches the width of a real page",
    file: SKELETON,
    from: 'className="mx-auto max-w-5xl px-4 py-8 sm:px-6"',
    to: 'className="mx-auto max-w-2xl px-2 py-2 sm:px-6"',
    expect: "same width and padding",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim());
    return { green: false, failed: failed.length ? failed : ["(exited non-zero with no FAIL line)"] };
  }
}

console.log("navigation-cost mutations\n");
const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => { for (const [f, t] of originals) writeFileSync(f, t); };

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }
  for (const m of MUTANTS) {
    const original = originals.get(m.file);
    if (!original.includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, m.all ? original.split(m.from).join(m.to) : original.replace(m.from, m.to));
    let result;
    try { result = runGate(); } finally { restoreAll(); }
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
console.log(after.green ? "\nbaseline: green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length) { console.log("\nHOLES:"); for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`); }
  process.exit(1);
}
console.log("The cost of a page transition cannot creep back without this going red.");
