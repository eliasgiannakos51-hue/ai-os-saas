/**
 * EVERY CAPABILITY DECLARES A TIER, OR THE BUILD IS RED.
 *
 * THE THING THIS PREVENTS, in the owner's words: "αλλιώς σε έναν χρόνο θα
 * έχω 40 features, όλα δωρεάν, και πέντε πλάνα που διαφέρουν μόνο σε
 * credits." That is not a hypothetical — it is a description of the state
 * this gate was written in. Of 136 API routes, THREE read a plan
 * capability. Of 44 pages under /dashboard, EIGHT are plan-aware. V5
 * added Projects, Presentations, Posts, Voice, Predictions and Universal
 * Memory and not one of them was put in a plan.
 *
 * A REQUEST WOULD HAVE BEEN IGNORED. "Remember to add a tier" is the kind
 * of instruction that survives exactly as long as the person who wrote
 * it is the person adding the feature. So the rule is mechanical and it
 * is stated as coverage rather than as intent:
 *
 *   1. every row in lib/sidebar-nav.ts
 *   2. every page under src/app/dashboard
 *   3. every route under src/app/api
 *
 * must be claimed by exactly one entry of FEATURE_CATALOG, and every
 * entry carries `minPlan`. Add a page, add a route, add a nav row — the
 * build fails until you say who may use it.
 *
 * WHY ALL THREE AND NOT JUST THE SIDEBAR. The worst offenders were never
 * in the sidebar. api/text-actions, api/import/paste, api/insights/
 * generate and api/transitions/detect all spend credits and none has a
 * row anywhere; they are reached from buttons inside other screens,
 * which is exactly the "ψάξε ΚΑΙ ό,τι δεν φαίνεται" case.
 *
 * WHAT IT DOES NOT CLAIM. That the tiers are the RIGHT tiers. That is a
 * commercial decision and no test can hold it. What it holds is that one
 * was made, in writing, by the person who added the feature.
 *
 * Run: node scripts/tests/feature-catalog.test.mjs
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

const catalog = await loadTs("src/lib/billing/feature-catalog.ts");
const { FEATURE_CATALOG, FEATURE_GROUPS, SIDEBAR_HEADING_FOR_GROUP, soldFeatures, unlockPlanFor } =
  catalog;
const { PLANS } = await loadTs("src/lib/billing/plans.ts");

// PARSED, NOT IMPORTED, and for the reason the three existing sidebar
// gates already state in their own headers: lib/sidebar-nav.ts imports
// forty icons from lucide-react, and a gate may not reach node_modules.
// Comments are stripped FIRST — this file's header quotes hrefs and
// headings in prose, and a scanner that counts those is counting the
// documentation.
const navSrc = stripComments(readFileSync("src/lib/sidebar-nav.ts", "utf8"));

// ---------------------------------------------------------------------
// The three surfaces, derived from disk rather than listed here.
// ---------------------------------------------------------------------

/** Every directory under `dir` holding a `want` file, as its path. */
function surfacesUnder(dir, want, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...surfacesUnder(full, want, prefix ? `${prefix}/${entry}` : entry));
    } else if (entry === want) {
      out.push(prefix);
    }
  }
  return out;
}

const pages = surfacesUnder("src/app/dashboard", "page.tsx").sort();
const routes = surfacesUnder("src/app/api", "route.ts").sort();
// SIX ROWS DO NOT SPELL THEIR OWN HREF. Chat, Home, Timeline, Mission
// Control, Reflection and Settings are written as `CHAT_NAV_ITEM.href`
// and friends, so a scan for string literals finds forty-two rows and
// silently misses six — including the two most-used screens in the
// product. Resolved through lib/modules.ts, which is where those
// constants live and which a gate can execute.
const modules = await loadTs("src/lib/modules.ts");
const indirectHrefs = [...navSrc.matchAll(/\b([A-Z][A-Z_]*_NAV_ITEM)\.href\b/g)].map((m) => {
  const item = modules[m[1]];
  if (!item || typeof item.href !== "string") {
    throw new Error(`sidebar-nav.ts references ${m[1]}.href, which lib/modules.ts does not export`);
  }
  return item.href;
});
// HELD POSITIONS ARE NOT FEATURES YET, and are the one kind of nav row
// that may go unclaimed. `notBuilt` rows (lib/sidebar-visibility.ts) name
// a route that does not exist; demanding a tier for one would be
// demanding a commercial decision about a thing nobody has built, which
// is the opposite of what this gate is for.
//
// THE DAY THE FLAG COMES OFF, the row becomes an ordinary nav row and
// this check goes red until somebody puts it in a plan — which is
// exactly the moment the decision is worth making, and exactly the
// moment it was skipped for Projects, Presentations, Posts, Voice and
// Predictions.
const declaredItems = [...navSrc.matchAll(/\{\s*href:\s*"([^"]+)"([^}]*)\}/g)].map((m) => ({
  href: m[1],
  notBuilt: /notBuilt:\s*true/.test(m[2]),
}));
const heldPositions = declaredItems.filter((i) => i.notBuilt).map((i) => i.href);
check(
  `the nav holds positions for what is not built (${heldPositions.length})`,
  // THREE: music, a browser agent and a computer agent. It was FOUR
  // until 2026-09-23, when meetings was built and its flag came off —
  // which is the only direction this number is supposed to move, and the
  // reason it is lowered in the same commit as the feature rather than
  // left as slack for the next one to grow into.
  //
  // The floor exists so a parser that stopped seeing `notBuilt` would
  // silently start demanding tiers for rows nobody has built.
  heldPositions.length >= 3,
  "a parser that stopped seeing notBuilt would silently start demanding tiers for them"
);
const navHrefs = [
  ...new Set([
    ...declaredItems.filter((i) => !i.notBuilt).map((i) => i.href),
    ...indirectHrefs,
  ]),
].sort();
check(
  `the six indirect rows resolved (${indirectHrefs.length} found)`,
  indirectHrefs.length >= 6,
  "a literal-only scan would miss Chat, Home, Timeline, Mission, Reflection and Settings"
);
const navHeadings = [...navSrc.matchAll(/\bheading:\s*"([^"]+)"/g)].map((m) => m[1]);

console.log(
  `== the three surfaces: ${navHrefs.length} nav rows, ${pages.length} pages, ${routes.length} api routes ==`
);

// A SURFACE COUNT THAT COULD GO TO ZERO IS A GATE THAT COULD PASS EMPTY.
// scan-unjudged-numbers.mjs exists because this repo has shipped exactly
// that: a scraper that returns nothing, a difference that is therefore
// empty, and a green line. Each of these is asserted against a floor
// BELOW today's value, so the check survives ordinary growth and dies
// the moment a walker stops walking.
check(`the nav has rows to check (${navHrefs.length} >= 30)`, navHrefs.length >= 30);
check(`the page walker found pages (${pages.length} >= 40)`, pages.length >= 40);
check(`the route walker found routes (${routes.length} >= 120)`, routes.length >= 120);

// ---------------------------------------------------------------------
// 1. Coverage, both directions, on all three.
// ---------------------------------------------------------------------
console.log("\n== every surface is claimed by exactly one catalog entry ==");

function claimReport(kind, actual, claimField) {
  const claimedBy = new Map();
  const duplicates = [];
  for (const entry of FEATURE_CATALOG) {
    for (const claim of entry[claimField] ?? []) {
      if (claimedBy.has(claim)) duplicates.push(`${claim}: ${claimedBy.get(claim)} and ${entry.id}`);
      else claimedBy.set(claim, entry.id);
    }
  }
  const unclaimed = actual.filter((a) => !claimedBy.has(a));
  const phantom = [...claimedBy.keys()].filter((c) => !actual.includes(c));
  checkEqual(`every ${kind} is claimed`, unclaimed, []);
  checkEqual(`no ${kind} claim points at something that does not exist`, phantom, []);
  checkEqual(`no ${kind} is claimed twice`, duplicates, []);
  return claimedBy;
}

claimReport("sidebar row", navHrefs, "sidebar");
claimReport("dashboard page", pages, "pages");
const routeOwner = claimReport("api route", routes, "routes");

// ---------------------------------------------------------------------
// 2. Every entry declares a tier that exists.
// ---------------------------------------------------------------------
console.log("\n== every entry declares a tier, and the tier is a real plan ==");

const planSlugs = PLANS.map((p) => p.slug);
const badTiers = FEATURE_CATALOG.filter((f) => !planSlugs.includes(f.minPlan)).map(
  (f) => `${f.id}: ${JSON.stringify(f.minPlan)}`
);
checkEqual("every minPlan is one of the six plans", badTiers, []);

const badGroups = FEATURE_CATALOG.filter((f) => !FEATURE_GROUPS.includes(f.group)).map((f) => f.id);
checkEqual("every entry is in one of the seven groups", badGroups, []);

const duplicateIds = FEATURE_CATALOG.map((f) => f.id).filter(
  (id, i, all) => all.indexOf(id) !== i
);
checkEqual("no two entries share an id", duplicateIds, []);

// ---------------------------------------------------------------------
// 3. `charges` is measured, not asserted.
// ---------------------------------------------------------------------
console.log("\n== an entry that says it is free does not own a route that spends credits ==");

// THE THREE CALLS THAT MOVE MONEY, and the third is the one a
// two-function list misses: api/modules/create charges with
// `deductCredits` rather than the reserve/settle pair, so a scan for the
// pair alone reports it as free and every tracking-log creation looks
// like it costs nothing. `hasEnoughCredits` is deliberately NOT here —
// it is a read, and a route that checks affordability and then does
// nothing has charged nobody.
const SPENDS = /\b(reserveCredits|settleReservation|deductCredits)\s*\(/;
const chargingRoutes = routes.filter((r) =>
  SPENDS.test(readFileSync(`src/app/api/${r}/route.ts`, "utf8"))
);
check(
  `the credit scan found charging routes (${chargingRoutes.length} >= 20)`,
  chargingRoutes.length >= 20
);

const understated = [];
for (const route of chargingRoutes) {
  const owner = FEATURE_CATALOG.find((f) => f.id === routeOwner.get(route));
  if (owner && !owner.charges) understated.push(`${route} -> ${owner.id} says charges:false`);
}
checkEqual("no charging route belongs to an entry declared free", understated, []);

// The mirror, and it is the half that catches a stale `true` left behind
// after the credits came out of a feature.
const overstated = FEATURE_CATALOG.filter(
  (f) => f.charges && !(f.routes ?? []).some((r) => chargingRoutes.includes(r))
).map((f) => f.id);
checkEqual("no entry claims to charge while none of its routes does", overstated, []);

// ---------------------------------------------------------------------
// 4. The enforcement each entry names still exists.
// ---------------------------------------------------------------------
console.log("\n== every entry names code that exists and still contains the symbol ==");

const brokenEvidence = [];
for (const f of FEATURE_CATALOG) {
  if (!f.enforcedIn) {
    brokenEvidence.push(`${f.id}: names no enforcing module`);
    continue;
  }
  if (!existsSync(f.enforcedIn)) {
    brokenEvidence.push(`${f.id}: ${f.enforcedIn} does not exist`);
    continue;
  }
  if (f.enforcedSymbol && !readFileSync(f.enforcedIn, "utf8").includes(f.enforcedSymbol)) {
    brokenEvidence.push(`${f.id}: ${f.enforcedIn} no longer contains \`${f.enforcedSymbol}\``);
  }
}
checkEqual("every enforcement reference resolves", brokenEvidence, []);

// ---------------------------------------------------------------------
// 5. "Unlimited" is proven, per plan, by executing the cell.
// ---------------------------------------------------------------------
console.log('\n== every "unlimited" cell carries its proof, and the bound is visible ==');

const words = {
  unlimited: "Unlimited",
  included: "Included",
  custom: "Custom",
  perSeat: "/seat",
  perHour: "/hour",
  perDay: "/day",
  minutesPerMonth: "min/month",
};

const sold = soldFeatures();
const soldIds = new Set(sold.map((f) => f.id));

/** The cell for one plan, executed — not read as text. */
function cellFor(feature, plan) {
  return feature.cell(plan, "en", words);
}

let unlimitedCells = 0;
const unprovenUnlimited = [];
const invisibleBounds = [];
for (const feature of FEATURE_CATALOG) {
  for (const plan of PLANS) {
    const cell = cellFor(feature, plan);
    if (cell.type !== "unlimited") continue;
    unlimitedCells++;
    const proof = feature.unlimitedProof;
    if (!proof) {
      unprovenUnlimited.push(`${feature.id} says unlimited on ${plan.slug} with no unlimitedProof`);
      continue;
    }
    for (const boundId of proof.alsoBoundedBy) {
      if (!soldIds.has(boundId)) {
        invisibleBounds.push(
          `${feature.id} on ${plan.slug} is bounded by "${boundId}", which is not a row a buyer sees`
        );
        continue;
      }
      const bound = FEATURE_CATALOG.find((f) => f.id === boundId);
      const boundCell = cellFor(bound, plan);
      if (boundCell.type === "unlimited") {
        invisibleBounds.push(
          `${feature.id} on ${plan.slug} names "${boundId}" as its bound, and that row is unlimited too`
        );
      }
    }
  }
}
check(`the cells were executed and some are unlimited (${unlimitedCells})`, unlimitedCells > 0);
checkEqual('no "unlimited" without a proof', unprovenUnlimited, []);
checkEqual("every declared bound is a visible, finite row on the same plan", invisibleBounds, []);

// AND THE PROOF'S ROUTES STILL ENFORCE THROUGH THE DECLARED ACCESSOR. A
// route that stopped calling it has a ceiling coming from somewhere the
// catalog cannot see, which is the hidden limit the word "unlimited" is
// only safe without.
const proofRouteProblems = [];
for (const f of FEATURE_CATALOG) {
  const proof = f.unlimitedProof;
  if (!proof) continue;
  if (!existsSync(proof.enforcedIn)) {
    proofRouteProblems.push(`${f.id}: ${proof.enforcedIn} does not exist`);
    continue;
  }
  const accessor = f.enforcedSymbol;
  for (const route of proof.routes) {
    if (!existsSync(route)) {
      proofRouteProblems.push(`${f.id}: ${route} does not exist`);
      continue;
    }
    if (accessor && !readFileSync(route, "utf8").includes(accessor)) {
      proofRouteProblems.push(`${f.id}: ${route} no longer calls ${accessor}`);
    }
  }
}
checkEqual("every unlimited proof's routes still enforce through the accessor", proofRouteProblems, []);

// ---------------------------------------------------------------------
// 6. The table and the catalog agree, in both directions.
// ---------------------------------------------------------------------
console.log("\n== the pricing table is the catalog, not a copy of it ==");

const pricingSrc = readFileSync("src/app/pricing/page.tsx", "utf8");
check(
  "the pricing page builds its rows from the catalog",
  pricingSrc.includes("featuresInGroup") || pricingSrc.includes("soldFeatures"),
  "no import of the catalog's readers — a hand-written row list is a second source of truth"
);
// THE SHAPE THAT CAME BEFORE. The table was 13 objects with a `labelKey`
// typed into page.tsx. Every one of them was true; the problem was the
// twenty-eight that were not there. A literal list cannot be checked
// against the product, so the literal list is what is forbidden.
const HAND_WRITTEN_ROW = /labelKey:\s*"([^"]+)"/g;
// A POSITIVE CONTROL, because "found none" and "could not look" are the
// same empty list — and this assertion's whole value is that the list is
// empty. The control is the exact shape the table used to have.
const control = 'const COMPARISON_ROWS = [\n  { labelKey: "creditsPerMonth", cell: () => null },\n];';
const controlHits = [...control.matchAll(HAND_WRITTEN_ROW)].map((m) => m[1]);
check(
  `the hand-written-row scanner can still see one (${controlHits.length})`,
  controlHits.length >= 1
);
const handWritten = [...pricingSrc.matchAll(HAND_WRITTEN_ROW)].map((m) => m[1]);
checkEqual("no row is declared by hand in the page", handWritten, []);

// ---------------------------------------------------------------------
// 7. The groups are the sidebar's groups.
// ---------------------------------------------------------------------
console.log("\n== the first five sections are the sidebar's own headings, in order ==");

const mirrored = FEATURE_GROUPS.map((g) => SIDEBAR_HEADING_FOR_GROUP[g]).filter(Boolean);
checkEqual("the mirrored headings are the sidebar's first five", mirrored, navHeadings.slice(0, 5));

// Every group has at least one row a buyer can see — an empty section is
// a heading that promises a list and shows nothing.
const emptyGroups = FEATURE_GROUPS.filter((g) => !sold.some((f) => f.group === g));
checkEqual("no section of the table is empty", emptyGroups, []);

// ---------------------------------------------------------------------
// 8. Ten languages, for every row and every section.
// ---------------------------------------------------------------------
console.log("\n== every row and section name exists in all ten locales ==");

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const missingKeys = [];
for (const locale of LOCALES) {
  const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  const rows = messages.pricing?.rows ?? {};
  const groups = messages.pricing?.groups ?? {};
  const values = messages.pricing?.values ?? {};
  for (const f of sold) {
    if (typeof rows[f.id] !== "string") missingKeys.push(`${locale}: pricing.rows.${f.id}`);
  }
  for (const g of FEATURE_GROUPS) {
    if (typeof groups[g] !== "string") missingKeys.push(`${locale}: pricing.groups.${g}`);
  }
  for (const w of ["unlimited", "included", "custom", "perSeat", "perHour", "perDay", "minutesPerMonth"]) {
    if (typeof values[w] !== "string") missingKeys.push(`${locale}: pricing.values.${w}`);
  }
}
checkEqual("nothing on the comparison table is untranslated", missingKeys, []);

// THE MIRROR: a row name left behind after its feature was deleted. It
// costs nothing today and it is what lets the row come back later
// looking already approved.
const orphanRowKeys = [];
{
  const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
  for (const key of Object.keys(en.pricing?.rows ?? {})) {
    if (!soldIds.has(key)) orphanRowKeys.push(key);
  }
}
checkEqual("no row name outlives the feature it named", orphanRowKeys, []);

// ---------------------------------------------------------------------
// 9. The upgrade wall can answer all three questions.
// ---------------------------------------------------------------------
console.log("\n== a locked feature can say what, which plan and how much ==");

const unanswerable = [];
for (const f of FEATURE_CATALOG) {
  if (f.minPlan === "free") continue;
  const unlock = unlockPlanFor(f.id);
  if (!unlock) {
    unanswerable.push(`${f.id}: no plan resolves`);
    continue;
  }
  if (!unlock.name) unanswerable.push(`${f.id}: the plan has no name to print`);
  if (unlock.priceEur === undefined || unlock.priceEur === null) {
    unanswerable.push(`${f.id}: the plan has no price to print`);
  }
}
checkEqual("every paid feature resolves to a named, priced plan", unanswerable, []);

// ---------------------------------------------------------------------
// 10. The counts the file's own header states.
// ---------------------------------------------------------------------
// PRINTED AND JUDGED, which is the distinction scan-unjudged-numbers.mjs
// was written for: schema-canaries printed what the newest migrations
// add and asserted nothing about it. Each number below is asserted.
console.log("\n== what the catalog says about this product, measured ==");

const freeForEveryone = sold.filter((f) => f.minPlan === "free");
const paid = sold.filter((f) => f.minPlan !== "free");
console.log(
  `  ${sold.length} rows a buyer sees, ${FEATURE_CATALOG.length - sold.length} withheld as not sold`
);
console.log(
  `  ${freeForEveryone.length} available on every plan, ${paid.length} gated behind a tier`
);
console.log(`  charging entries: ${FEATURE_CATALOG.filter((f) => f.charges).length}`);
for (const group of FEATURE_GROUPS) {
  console.log(`  ${group}: ${sold.filter((f) => f.group === group).length}`);
}

// THE ROW COUNT IS A DESIGN CONSTRAINT, not a statistic. Past forty rows
// the table stops being read; the page renders each section as a
// collapsible block for exactly that reason, and this is the number that
// forces the question to be asked again rather than drifting.
//
// 45 -> 46 on 2026-09-23, and the question it forced was asked rather
// than skipped, so the answer is here with the argument against it.
//
// AGAINST: the `meetings` row's cell is a check or a cross decided by
// `voiceMinutesForPlan(p.slug) > 0`, which is the SAME predicate as the
// `voiceMinutes` row two lines above it. Every plan with voice minutes
// has meetings and the only plan without is Free, so as a column of
// marks it is the voice row again.
//
// FOR, and this is why it stayed: the two rows answer different
// questions. "Voice minutes / month" tells a buyer how much; it does not
// tell them that uploading a recording and getting back a summary and a
// list of actions is a thing this product does at all. A capability
// nobody can find on the page they are deciding from is a capability
// they do not buy.
//
// The number goes up by exactly one, in the commit that adds the row.
check(`the table is ${sold.length} rows, and 46 is the ceiling`, sold.length <= 46);
check("the table is not empty", sold.length >= 20);

// AND THE ANSWER TO "WHY WOULD AN ULTIMATE PAY 10x". Stated as a floor
// rather than a hope: some capability has to be gated, or the plans
// differ only in credits — which is the sentence the owner used.
check(
  `something is actually gated (${paid.length} paid rows)`,
  paid.length >= 8,
  "every row available on every plan means five plans that differ only in credits"
);

// =====================================================================
console.log(
  `\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`
);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
