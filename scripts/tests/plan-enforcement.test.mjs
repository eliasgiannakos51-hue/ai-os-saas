/**
 * A FIELD IN `PlanCapabilities` IS A PROMISE. THIS IS THE MECHANISM.
 *
 * WHAT IT EXISTS BECAUSE OF, and it had existed for as long as the field
 * had: `capabilities.websiteBuilder` was declared on all six plans,
 * false on Free, drawn as a ✕ on the pricing page and a ✕ on the signup
 * grid — and read by NOTHING that refuses anything. Three call sites in
 * the product, all three drawing a tick. A Free account could open
 * /dashboard/website-builder and generate a site.
 *
 * It survived because the paywall existed one step later:
 * `maxPublishedSitesForPlan` is 0 on Free and the publish route does
 * refuse, so anybody who checked casually met a refusal and stopped.
 * The expensive half — the model call — ran for free.
 *
 * AND THE OTHER ONE, quieter and just as real. /dashboard/memory
 * refused with `planMeetsMinimum(planSlug, "starter")`: a correct
 * refusal that never mentions `capabilities.aiMemory`. The field and
 * the lock agreed by coincidence, and moving AI Memory to Growth would
 * have moved the ✓/✕ column and left the door open. A capability
 * enforced by a parallel rule is not enforced by its declaration.
 *
 * SO THE RULE, in three parts, all mechanical:
 *
 *   1. every field of PlanCapabilities is claimed by exactly one entry
 *      of FEATURE_CATALOG — add a field, and the build is red until
 *      somebody says which row it is;
 *   2. a BUILT capability's `enforcedIn` file must both READ it and
 *      REFUSE — a file that mentions it and returns nothing is a
 *      display, not a gate;
 *   3. a capability declared `notBuilt` must be read by NOTHING outside
 *      plans.ts and the catalog. Enforce it and this goes red, which is
 *      what makes the flag come off in the same commit as the row.
 *
 * AND IT PRINTS THE TIER COVERAGE, per plan and per capability, on
 * every build.
 *
 * Run: node scripts/tests/plan-enforcement.test.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../lib/test-export-drift.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}
function checkEqual(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, a === e ? undefined : `expected ${e}\n        actual   ${a}`);
}

const PLANS_FILE = "src/lib/billing/plans.ts";
const CATALOG_FILE = "src/lib/billing/feature-catalog.ts";
const { PLANS } = await loadTs(PLANS_FILE);
const { FEATURE_CATALOG, soldFeatures } = await loadTs(CATALOG_FILE);

// ---------------------------------------------------------------------
// The fields, read off the TYPE rather than off one plan object.
// ---------------------------------------------------------------------
// Off the type, because a field every plan happens to omit would be
// invisible in the data and still be a declared promise in the source —
// and because `Object.keys(PLANS[0].capabilities)` is exactly the scan
// that cannot see the field somebody added to the type and forgot to
// fill in.
const plansSrc = readFileSync(PLANS_FILE, "utf8");
const capBlock = plansSrc.slice(
  plansSrc.indexOf("export type PlanCapabilities = {"),
  plansSrc.indexOf("\n};", plansSrc.indexOf("export type PlanCapabilities = {"))
);
const declaredFields = [...stripComments(capBlock).matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*)\??:\s*(.+);$/gm)].map(
  (m) => ({ name: m[1], type: m[2].trim() })
);

console.log(`== PlanCapabilities declares ${declaredFields.length} fields ==`);
check(
  `the type scan found fields (${declaredFields.length} >= 6)`,
  declaredFields.length >= 6,
  "an empty field list makes every check below pass on nothing"
);
// Every declared field is filled in on every plan — a field on the type
// that a plan omits is `undefined`, which is falsy, which is a silent
// "no" for a plan somebody meant to say "yes" for.
const unfilled = [];
for (const plan of PLANS) {
  for (const f of declaredFields) {
    if (plan.capabilities[f.name] === undefined) unfilled.push(`${plan.slug}.${f.name}`);
  }
}
checkEqual("every plan fills in every declared capability", unfilled, []);

// ---------------------------------------------------------------------
// 1. Every field is claimed by exactly one catalog entry.
// ---------------------------------------------------------------------
console.log("\n== every capability is a row somebody declared a tier for ==");

const claimed = new Map();
const duplicates = [];
for (const entry of FEATURE_CATALOG) {
  if (!entry.capability) continue;
  if (claimed.has(entry.capability)) {
    duplicates.push(`${entry.capability}: ${claimed.get(entry.capability)} and ${entry.id}`);
  } else {
    claimed.set(entry.capability, entry.id);
  }
}
const unclaimedFields = declaredFields.filter((f) => !claimed.has(f.name)).map((f) => f.name);
checkEqual("every PlanCapabilities field is claimed by an entry", unclaimedFields, []);
checkEqual("no capability is claimed by two entries", duplicates, []);
const phantom = [...claimed.keys()].filter((c) => !declaredFields.some((f) => f.name === c));
checkEqual("no entry claims a capability the type does not declare", phantom, []);

// ---------------------------------------------------------------------
// 2. A built capability is READ and REFUSED, in the file it names.
// ---------------------------------------------------------------------
console.log("\n== a built capability's enforcement both reads it and refuses ==");

// The shapes a refusal takes in this codebase. A file that mentions a
// capability and contains none of these is drawing something, not
// gating something — which is exactly what all three websiteBuilder
// call sites were.
const REFUSES = [
  /status:\s*40[0-9]/,
  /<UpgradeRequired\b/,
  /\bnotFound\(\)/,
  /\bredirect\(/,
  /ok:\s*false/,
];

const notEnforced = [];
for (const field of declaredFields) {
  const entry = FEATURE_CATALOG.find((f) => f.capability === field.name);
  if (!entry || entry.notBuilt) continue;
  if (!entry.enforcedIn || !existsSync(entry.enforcedIn)) {
    notEnforced.push(`${field.name}: ${entry.id} names ${entry.enforcedIn ?? "nothing"}, which is not there`);
    continue;
  }
  const src = stripComments(readFileSync(entry.enforcedIn, "utf8"));
  if (!src.includes(field.name)) {
    notEnforced.push(`${field.name}: ${entry.enforcedIn} never mentions it`);
    continue;
  }
  // A NUMBER BOUNDS, A BOOLEAN REFUSES. `chatMemoryLimit` is read and
  // passed as a limit; there is nothing for it to return 403 about, and
  // demanding one would push it into a fake refusal. A boolean has only
  // two answers and one of them has to be a door that does not open.
  const isBoolean = field.type === "boolean";
  if (isBoolean && !REFUSES.some((re) => re.test(src))) {
    notEnforced.push(`${field.name}: ${entry.enforcedIn} reads it and refuses nothing`);
  }
}
checkEqual("every built capability is read where something is refused", notEnforced, []);

// AND THE ONE THAT STARTED THIS, BY NAME. The generic rule above would
// pass if somebody re-pointed the entry at another file that happens to
// contain both the word and a 403. These two pin the actual gates.
// COMMENTS STRIPPED, and the first run of this gate is why the rule is
// worth restating. memory/page.tsx now carries a paragraph EXPLAINING
// that it used to be `planMeetsMinimum(planSlug, "starter")` — and the
// check below, which forbids that call, read the explanation as the
// call and failed a file that had just been fixed. A scanner that
// cannot tell code from the comment about the code is measuring the
// documentation.
const codeOf = (file) => stripComments(readFileSync(file, "utf8"));
const generateSrc = codeOf("src/app/api/websites/generate/route.ts");
check(
  "api/websites/generate refuses an account whose plan has no website builder",
  /accountHasCapability\([^)]*"websiteBuilder"/.test(generateSrc) && /status:\s*403/.test(generateSrc)
);
const builderPage = codeOf("src/app/dashboard/website-builder/page.tsx");
check(
  "…and the page shows a wall rather than the workspace",
  /accountHasCapability\([^)]*"websiteBuilder"/.test(builderPage) && /<UpgradeRequired/.test(builderPage)
);
// THE PAGE MOVED. /dashboard/memory is a permanent redirect now — the
// two features that shared that URL were separated, so AI Memory lives
// at /dashboard/ai-memory and the record search at /dashboard/search.
// BOTH are pinned, because both arrived carrying the parallel-rank
// shape and both had to be converted; checking only the one that was
// already fixed would be checking the easy half.
const aiMemoryPage = codeOf("src/app/dashboard/ai-memory/page.tsx");
check(
  "AI Memory is gated on its own field, not on a parallel plan rank",
  /accountHasCapability\([^)]*"aiMemory"/.test(aiMemoryPage) && !/planMeetsMinimum/.test(aiMemoryPage)
);
const searchPage = codeOf("src/app/dashboard/search/page.tsx");
check(
  "…and so is the record search, on a field of its own",
  /accountHasCapability\([^)]*"recordSearch"/.test(searchPage) && !/planMeetsMinimum/.test(searchPage)
);

// ---------------------------------------------------------------------
// 3. A capability declared NOT BUILT is read by nothing.
// ---------------------------------------------------------------------
console.log("\n== a tier held for something unbuilt is enforced nowhere ==");

function everyFileUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...everyFileUnder(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}
const sourceFiles = everyFileUnder("src");
check(
  `the source scan read the tree (${sourceFiles.length} files)`,
  sourceFiles.length >= 500,
  "a scan over nothing finds no leaks and passes"
);

const ALLOWED_TO_MENTION = new Set([PLANS_FILE, CATALOG_FILE]);
const notBuiltFields = FEATURE_CATALOG.filter((f) => f.notBuilt && f.capability);
check(
  `some tiers are held for unbuilt features (${notBuiltFields.length})`,
  notBuiltFields.length >= 1,
  "with none held, the two checks below are about nothing"
);

const leaked = [];
for (const entry of notBuiltFields) {
  for (const file of sourceFiles) {
    if (ALLOWED_TO_MENTION.has(file)) continue;
    if (stripComments(readFileSync(file, "utf8")).includes(entry.capability)) {
      leaked.push(`${entry.capability} is read in ${file} — if it works now, publish the row`);
    }
  }
}
checkEqual("no unbuilt capability is read outside plans.ts and the catalog", leaked, []);

// The reason has to be a reason. "todo" is not one, and a flag with a
// placeholder behind it is a flag nobody will ever be embarrassed into
// removing.
const thinReasons = notBuiltFields
  .filter((f) => typeof f.notBuilt !== "string" || f.notBuilt.length < 40)
  .map((f) => f.id);
checkEqual("every held tier says why it is not built, in words", thinReasons, []);

// AND IT IS NOT ON THE PRICING PAGE. The whole point of the flag.
const soldIds = new Set(soldFeatures().map((f) => f.id));
checkEqual(
  "no unbuilt capability has a row on the comparison table",
  notBuiltFields.filter((f) => soldIds.has(f.id)).map((f) => f.id),
  []
);

// ---------------------------------------------------------------------
// 4. TIER COVERAGE, printed on every build.
// ---------------------------------------------------------------------
console.log("\n== tier coverage ==");

const sold = soldFeatures();
const byPlan = PLANS.map((plan) => {
  const included = sold.filter((f) => {
    const cell = f.cell(plan, "en", {
      unlimited: "Unlimited", included: "Included", custom: "Custom", perSeat: "/seat",
      perHour: "/hour", perDay: "/day", minutesPerMonth: "min/month",
    });
    return cell.type !== "cross";
  }).length;
  return { slug: plan.slug, included };
});
const width = Math.max(...byPlan.map((p) => p.slug.length));
for (const { slug, included } of byPlan) {
  const bar = "#".repeat(Math.round((included / sold.length) * 30));
  console.log(
    `  ${slug.padEnd(width)}  ${String(included).padStart(2)}/${sold.length}  ${bar}`
  );
}
console.log(
  `  ${"capabilities".padEnd(width)}  ${declaredFields.length} declared, ` +
    `${notBuiltFields.length} held for unbuilt features, ` +
    `${declaredFields.length - notBuiltFields.length} enforced`
);

// THE COVERAGE IS JUDGED, not only printed — scan-unjudged-numbers.mjs
// exists because this repository has shipped a figure computed, printed
// and asserted about by nothing.
//
// FREE MUST NOT GET EVERYTHING: if every row is included on Free the
// plans differ only in credits, which is the sentence this whole round
// started from.
const free = byPlan.find((p) => p.slug === "free");
const top = byPlan.find((p) => p.slug === "ultimate");
check(
  `Free is not the whole product (${free.included} of ${sold.length} rows)`,
  free.included < sold.length * 0.75,
  "every row on Free means five plans that differ only in credits"
);

// THE RATIO ABOVE IS A SMOKE ALARM, AND IT IS NOT THE RULE.
//
// Measured 2026-09-17 by the mutation suite: setting NINE of the Free
// plan's fourteen capabilities to true — websiteBuilder, aiMemory,
// teamCollaboration, customAiPersona, presentations, posts, predictions,
// 50 agents, 100 chat memories — left this gate GREEN. 45 sold rows are
// not 45 capabilities; most of them are a number, and Free carries a
// number for nearly all of them, so nine doors opening moves the ratio
// by less than the slack in 75%. A threshold over a mixed population is
// a threshold over the wrong denominator.
//
// THE RULE IS PER ROW, and the catalogue already carries it: every entry
// declares `minPlan`, the lowest plan that may use it at all. So a row
// whose minPlan is above free must draw a CROSS on Free — one capability
// flipped is one red line that names itself, with no ratio in the way.
const planOrder = PLANS.map((p) => p.slug);
const freePlan = PLANS.find((p) => p.slug === "free");
const WORDS = {
  unlimited: "Unlimited", included: "Included", custom: "Custom", perSeat: "/seat",
  perHour: "/hour", perDay: "/day", minutesPerMonth: "min/month",
};
// ONE COLLECTION, BOTH CHECKS. The floor below counted the paid rows
// with a SECOND copy of the same filter, and a mutant that blinded the
// first one left the second one counting happily — the floor was beside
// the assignment chain rather than on it, which is the exact failure
// gate-vacuity.test.mjs exists for, written inside the check meant to
// prevent it.
const paidRows = sold.filter((f) => planOrder.indexOf(f.minPlan) > 0);
const givenAway = paidRows
  .filter((f) => f.cell(freePlan, "en", WORDS).type !== "cross")
  .map((f) => `${f.id} (minPlan ${f.minPlan}) is not a cross on Free`);
// AND THE POPULATION HAS ITS FLOOR FIRST. If every entry were minPlan
// "free" — or the predicate that finds them went blind — the check below
// would iterate nothing and pass, which is the shape this whole file was
// written about reappearing inside its own newest assertion.
check(
  `there are paid rows to ask about (${paidRows.length})`,
  paidRows.length >= 5,
  "every sold row reads minPlan 'free', so the check below is asking nothing"
);
check(
  `no row Free may not use is open on Free (${paidRows.length} paid rows)`,
  givenAway.length === 0,
  givenAway.join("\n        ")
);
check(
  `the top plan includes more than Free (${top.included} vs ${free.included})`,
  top.included > free.included
);
// AND THE LADDER ONLY GOES UP. A plan that includes FEWER rows than a
// cheaper one is a pricing bug nobody would find by reading the table.
const order = PLANS.map((p) => p.slug);
const regressions = [];
for (let i = 1; i < byPlan.length; i += 1) {
  if (byPlan[i].included < byPlan[i - 1].included) {
    regressions.push(`${order[i]} (${byPlan[i].included}) < ${order[i - 1]} (${byPlan[i - 1].included})`);
  }
}
checkEqual("no plan includes less than the plan below it", regressions, []);

// =====================================================================
console.log(
  `\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`
);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
