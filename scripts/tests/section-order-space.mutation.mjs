#!/usr/bin/env node
/*
 * IS THE CYCLE LOAD-BEARING, OR JUST PRESENT?
 *
 * section-order-space.test.mjs says three things that would each be worth
 * a paid measurement run: two strangers collide at 1 in 6, one person
 * never repeats inside their first six sites, and the composition axes
 * still move while the order walks. Each mutation below removes one of
 * the mechanisms behind those and requires the clause that names it to go
 * red.
 *
 * THE LAST TWO ARE THE ONES TO READ. A cycle that is computed and not
 * PASSED does nothing, and a cycle that is passed but ignored inside the
 * draw does nothing either — both leave the previous hash running in
 * production with every number in this directory unchanged, because every
 * other gate measures the function rather than the wiring.
 * lib/website-variation.ts's own header records this repository shipping
 * exactly that shape once: four axes drawn and left out of the directive.
 *
 * Run: node scripts/tests/section-order-space.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/section-order-space.test.mjs";
const VARIATION = "src/lib/website-variation.ts";
const ROUTE = "src/app/api/websites/generate/process/route.ts";
const TARGETS = [GATE, VARIATION, ROUTE];

const MUTANTS = [
  {
    // 1. BACK TO THREE ORDERS. The state the round began in: two
    // strangers of one kind collided on the skeleton 33.3% of the time,
    // and no prompt wording could have moved it.
    name: "the order list drops back to three",
    file: VARIATION,
    from: '  "D — the archetype\'s ORDER D, exactly as listed for the shape you chose",\n  "E — the archetype\'s ORDER E, exactly as listed for the shape you chose",\n  "F — the archetype\'s ORDER F, exactly as listed for the shape you chose",\n',
    to: "",
    expect: "there are six section orders",
  },
  {
    // 2. THE CYCLE BECOMES A DRAW AGAIN. Same six orders, hashed
    // independently per site — which is what gave 59.9% of a person's
    // sites a skeleton they already had.
    name: "the order goes back to being hashed per site",
    file: VARIATION,
    from: "    order: cycle\n      ? SECTION_ORDERS[orderIndexFor(cycle.userKey, cycle.priorSites, SECTION_ORDERS.length)]\n      : pick(SECTION_ORDERS, \"order\"),",
    to: '    order: pick(SECTION_ORDERS, "order"),',
    expect: "nobody repeats an order inside their first 6 sites",
  },
  {
    // 3. THE STEP GOES. Every one of a person's sites gets their one
    // starting letter, for ever — the worst version of the defect, and it
    // passes any check that only asks whether two STRANGERS differ.
    name: "the cycle stops stepping, so one person gets one order for ever",
    file: VARIATION,
    from: "  return (base + step) % count;",
    to: "  return base % count;",
    expect: "nobody repeats an order inside their first 6 sites",
  },
  {
    // 4. EVERY ACCOUNT STARTS AT THE SAME PLACE. The cycle still works
    // per person, and every person on the platform is in lockstep: their
    // first sites are all ORDER A, their second all B. Two strangers
    // would collide 100% of the time.
    name: "every account starts the cycle at the same letter",
    file: VARIATION,
    from: "  const base = fnv1a(`order::${userKey}`) % count;",
    to: "  const base = 0;",
    expect: "two strangers collide at about 1 in 6",
  },
  {
    // 5. THE NEGATIVE-COUNT GUARD GOES. `priorSites` is a nullable
    // database count; a negative remainder in JavaScript is negative, and
    // SECTION_ORDERS[-1] is undefined, which reaches the model as the
    // word "undefined" on the line the prompt calls non-negotiable.
    name: "a negative site count is trusted",
    file: VARIATION,
    from: "  const step = Number.isFinite(priorSites) ? Math.max(0, Math.floor(priorSites)) : 0;",
    to: "  const step = priorSites;",
    expect: "still indexes inside the list",
  },
  {
    // 6. THE CYCLE IS COMPUTED AND NOT DELIVERED. Production falls back
    // to the hash; nothing else in this directory notices, because
    // everything else calls pickVariation directly.
    name: "the route stops passing the cycle",
    file: ROUTE,
    from: "        pickVariation([user.id, priorSites ?? 0, description], {\n          userKey: user.id,\n          priorSites: priorSites ?? 0,\n        })",
    to: "        pickVariation([user.id, priorSites ?? 0, description])",
    expect: "the process route hands the cycle to the draw",
    gate: "scripts/tests/website-structural-similarity.test.mjs",
  },
];

function runGate(file) {
  try {
    execFileSync(process.execPath, [file], { encoding: "utf8", stdio: "pipe", timeout: 600_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("section-order-space mutations\n");

const GATES = [...new Set([GATE, ...MUTANTS.map((m) => m.gate ?? GATE)])];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  for (const g of GATES) {
    const base = runGate(g);
    console.log(`baseline: ${g.split("/").pop()} is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
    if (!base.green) {
      console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
      process.exit(1);
    }
  }

  for (const m of MUTANTS) {
    const gate = m.gate ?? GATE;
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate(gate);
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: `${gate} stayed green — nothing here is load-bearing` });
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

let allGreen = true;
for (const g of GATES) {
  const after = runGate(g);
  if (!after.green) allGreen = false;
}
console.log(
  allGreen
    ? "\nbaseline: every gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !allGreen) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
