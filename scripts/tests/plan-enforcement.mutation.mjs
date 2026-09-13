#!/usr/bin/env node
/*
 * CAN THE GATE SEE A CAPABILITY GO BACK TO BEING DECORATION?
 *
 * The defect it was written for is the quietest kind there is: a field
 * declared on six plans, drawn as a ✓ or a ✕ on two surfaces, and read
 * by nothing that refuses. Nothing throws, nothing looks broken, the
 * pricing page renders perfectly, and the only symptom is that Free
 * accounts are using a paid feature.
 *
 * Every mutation below is something a person would plausibly do:
 * delete a gate while refactoring, add a capability and forget the row,
 * swap a capability check for a plan-rank check because it reads
 * simpler, or start enforcing a tier that was only ever a placeholder.
 *
 * DIFFERENT DIMENSIONS, ON PURPOSE — the suite fails if any dimension
 * is left with one mutant.
 *
 * Run: node scripts/tests/plan-enforcement.mutation.mjs
 */
import { readFileSync } from "node:fs";
// The sidecar helper, not node:fs: a run killed mid-mutation has no
// finally, and the sidecar is what heals the tree on the next run.
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/plan-enforcement.test.mjs";
const PLANS = "src/lib/billing/plans.ts";
const CATALOG = "src/lib/billing/feature-catalog.ts";
const GENERATE = "src/app/api/websites/generate/route.ts";
const BUILDER_PAGE = "src/app/dashboard/website-builder/page.tsx";
const MEMORY_PAGE = "src/app/dashboard/memory/page.tsx";
const TARGETS = [PLANS, CATALOG, GENERATE, BUILDER_PAGE, MEMORY_PAGE, GATE];

const MUTANTS = [
  // ---- A. THE ORIGINAL DEFECT, PUT BACK ----------------------------
  {
    dimension: "A. a capability stops refusing",
    name: "the route gate is deleted, so the builder is free again",
    file: GENERATE,
    from: '      if (!accountHasCapability(gatePlanSlug, "websiteBuilder", isAdminEmail(user.email))) {',
    to: "      if (false) {",
    expect: "api/websites/generate refuses an account whose plan has no website builder",
  },
  {
    dimension: "A. a capability stops refusing",
    name: "the page renders the workspace instead of the wall",
    file: BUILDER_PAGE,
    from: '  if (!accountHasCapability(planSlug, "websiteBuilder", isAdmin)) {',
    to: "  if (false) {",
    expect: "the page shows a wall rather than the workspace",
  },
  {
    dimension: "A. a capability stops refusing",
    name: "the gate reads the capability and returns nothing — a display, not a door",
    file: CATALOG,
    from: '    enforcedIn: "src/app/api/websites/generate/route.ts",\n    enforcedSymbol: \'accountHasCapability(gatePlanSlug, "websiteBuilder"\',',
    to: '    enforcedIn: "src/app/signup/signup-flow.tsx",\n    enforcedSymbol: "websiteBuilder",',
    // THE GENERIC CLAUSE, not the by-name one: signup-flow.tsx really
    // does contain "websiteBuilder", so the entry still resolves — what
    // it does not contain is a refusal, and that is the clause that has
    // to notice. Pointing an entry at a DISPLAY is precisely the defect
    // this gate exists for, and it was the state of the catalog for a
    // day: the websiteBuilder row named lib/build-modules.ts, which
    // gates a different feature entirely.
    expect: "every built capability is read where something is refused",
  },

  // ---- B. THE PARALLEL RULE COMES BACK ------------------------------
  {
    dimension: "B. enforced by something other than the field",
    name: "AI Memory goes back to a plan-rank check that never names the capability",
    file: MEMORY_PAGE,
    from: '  if (!accountHasCapability(planSlug, "aiMemory", isAdmin)) {',
    to: '  if (!isAdmin && !planMeetsMinimum(planSlug, "starter")) {',
    expect: "AI Memory is gated on its own field, not on a parallel plan rank",
  },
  {
    dimension: "B. enforced by something other than the field",
    name: "a capability's enforcement is re-pointed at a file that only displays it",
    file: CATALOG,
    from: '    enforcedIn: "src/app/dashboard/memory/page.tsx",\n    enforcedSymbol: \'accountHasCapability(planSlug, "aiMemory"\',',
    to: '    enforcedIn: "src/app/roadmap/page.tsx",\n    enforcedSymbol: "aiMemory",',
    expect: "every built capability is read where something is refused",
  },

  // ---- C. A NEW CAPABILITY WITH NO ROW ------------------------------
  {
    dimension: "C. a capability with no declared tier",
    name: "a field is added to the type and to no row",
    file: PLANS,
    from: "  /** A published site on the customer's own domain.",
    to: "  zzUndeclared: boolean;\n\n  /** A published site on the customer's own domain.",
    expect: "every PlanCapabilities field is claimed by an entry",
  },
  {
    dimension: "C. a capability with no declared tier",
    name: "a row claims a capability the type never declared",
    file: CATALOG,
    from: '    capability: "customDomain",',
    to: '    capability: "zzNotAField",',
    expect: "no entry claims a capability the type does not declare",
  },

  // ---- D. A HELD TIER STARTS BEING REAL -----------------------------
  {
    dimension: "D. a held tier leaks",
    name: "something starts enforcing a tier that was only a placeholder",
    file: "src/app/api/team/invite/route.ts",
    from: "    const seatCap = maxSeatsForPlan(tier as PlanSlug);",
    to: '    const seatCap = plan.capabilities.privateMarketplace ? Infinity : maxSeatsForPlan(tier as PlanSlug);',
    expect: "no unbuilt capability is read outside plans.ts and the catalog",
  },
  {
    dimension: "D. a held tier leaks",
    name: "a held tier is quietly published as a row while still unbuilt",
    file: CATALOG,
    from: '    notBuilt:\n      "there is no api_keys table and no route that authenticates by key — every route " +\n      "in this product authenticates a browser session",',
    to: '    notBuilt: "todo",',
    expect: "every held tier says why it is not built, in words",
  },

  // ---- E. THE LADDER STOPS GOING UP ---------------------------------
  {
    dimension: "E. the coverage itself",
    name: "Free is given everything, so the plans differ only in credits",
    file: PLANS,
    // THE WHOLE BLOCK, and two booleans would not have done it: the
    // coverage check asks whether Free is under three quarters of the
    // table, and flipping two rows moves it from 22/44 to 24/44. The
    // defect being probed is "everything is free", so the mutation has
    // to be everything — which is also the honest shape of how it would
    // really happen, as one careless copy of a richer plan's block.
    from: '      maxAiAgents: 0,\n      websiteBuilder: false,\n      aiMemory: false,\n      teamCollaboration: false,\n      chatMemoryLimit: 0,\n      customAiPersona: false,\n      presentations: false,\n      posts: false,\n      predictions: false,',
    to: '      maxAiAgents: 50,\n      websiteBuilder: true,\n      aiMemory: true,\n      teamCollaboration: true,\n      chatMemoryLimit: 100,\n      customAiPersona: true,\n      presentations: true,\n      posts: true,\n      predictions: true,',
    expect: "Free is not the whole product",
  },
  {
    dimension: "E. the coverage itself",
    name: "a plan fills in fewer capabilities than the type declares",
    file: PLANS,
    from: "      presentations: true,\n      posts: true,\n      predictions: true,\n      customDomain: true,\n      publicApi: false,\n      privateMarketplace: false,\n      slaResponse: false,\n    },\n    features: [\n      { textKey: \"everythingInStarter\" },",
    to: "      posts: true,\n      predictions: true,\n      customDomain: true,\n      publicApi: false,\n      privateMarketplace: false,\n      slaResponse: false,\n    },\n    features: [\n      { textKey: \"everythingInStarter\" },",
    expect: "every plan fills in every declared capability",
  },

  // ---- F. THE GATE'S OWN SCRAPERS -----------------------------------
  {
    dimension: "F. the gate's own scrapers",
    name: "the capability-type scan stops finding fields",
    file: GATE,
    from: "const declaredFields = [...stripComments(capBlock).matchAll(/^\\s{2}([A-Za-z][A-Za-z0-9]*)\\??:\\s*(.+);$/gm)].map(",
    to: "const declaredFields = [...stripComments(capBlock).matchAll(/(?!)/g)].map(",
    expect: "the type scan found fields",
  },
  {
    dimension: "F. the gate's own scrapers",
    name: "the source walker stops walking, so no leak can be found",
    file: GATE,
    from: "    else if (/\\.(ts|tsx)$/.test(entry)) out.push(full);",
    to: "    else if (/\\.(ts|tsx)$/.test(entry) && false) out.push(full);",
    expect: "the source scan read the tree",
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

console.log("plan-enforcement mutations\n");
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
const byDimension = new Map();
try {
  const base = runGate();
  console.log(`baseline: ${base.green ? "GREEN" : "RED"}`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    byDimension.set(m.dimension, (byDimension.get(m.dimension) ?? 0) + 1);
    const before = originals.get(m.file) ?? readFileSync(m.file, "utf8");
    if (!originals.has(m.file)) originals.set(m.file, before);
    if (!before.includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    writeFileSync(m.file, before.replace(m.from, m.to));
    const result = runGate();
    restoreAll();
    const named = result.failed.find((f) => f.includes(m.expect));
    if (named) {
      caught++;
      console.log(`  CAUGHT  ${m.name}\n          -> ${named}`);
    } else {
      missed.push({
        ...m,
        why: result.green
          ? "the gate stayed green"
          : `red, but not on "${m.expect}" — on: ${result.failed.slice(0, 3).join(" | ")}`,
      });
      console.log(`  MISSED  ${m.name}`);
    }
  }
} finally {
  restoreAll();
}

console.log("\ndimensions probed:");
const thin = [];
for (const [dimension, count] of [...byDimension].sort()) {
  console.log(`  ${count} x ${dimension}`);
  if (count < 2) thin.push(dimension);
}
if (thin.length > 0) console.log(`\nTHIN DIMENSIONS (one mutant each): ${thin.join(", ")}`);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
}
if (missed.length > 0 || thin.length > 0) process.exit(1);
console.log(`Every clause holds, across ${byDimension.size} dimensions.`);
