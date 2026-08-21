// THE COMBINED CEILING GATE.
//
// One question, asked once: can an account generate more than 25% of what
// it pays us in Anthropic cost, counting EVERYTHING — credits and every
// free quota together?
//
// This file exists because the answer was yes for a year and two green
// tests said no. billing-coverage.test.mjs checked the credit subsystem
// against 25% and passed at 25.0%. free-chat.test.mjs checked free chat
// against 25% and passed at 18.8%. Nothing added them up, so Professional
// and Ultimate ran at 43.8% — a combined margin of 2.28x against a stated
// 4x target — and no build could see it.
//
// The five sections below are in order of how much they protect:
//
//   1  the arithmetic, today, per plan
//   2  the arithmetic under every environment the config permits
//   3  the SOURCE SCAN — the only section that catches a quota nobody has
//      written yet
//   4  registry <-> declared-shares symmetry, both directions
//   5  Enterprise, which has no price in code and therefore used to be
//      unmeasurable
//
// Run: node scripts/tests/combined-ceiling.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadTs } from "./load-ts.mjs";

const allowances = await loadTs("src/lib/billing/free-allowances.ts");
const ceiling = await loadTs("src/lib/billing/ceiling.ts");
const plansMod = await loadTs("src/lib/billing/plans.ts");
const formula = await loadTs("src/lib/billing/credit-formula.ts");
const pricing = await loadTs("src/lib/billing/pricing-config.ts");
const marginPolicy = await loadTs("src/lib/billing/margin-policy.ts");

const {
  FREE_ALLOWANCES,
  combinedCeilingFor,
  combinedCeilingTable,
  assertRegistryMatchesShares,
} = allowances;
const {
  COMBINED_CEILING_SHARE,
  COMBINED_MARGIN_TARGET,
  DECLARED_ALLOWANCE_SHARES,
  FREE_PLAN_MAX_MONTHLY_COST_EUR,
  assertDeclaredSharesFit,
  enterpriseMinPriceEur,
  ceilingPriceEur,
} = ceiling;
const { PLANS } = plansMod;
const { parsePricingConfig, MARGIN_MULTIPLIER_MIN, MARGIN_MULTIPLIER_MAX } = pricing;

const BASE_CONFIG = parsePricingConfig({}).config;

let pass = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const pct = (n) => (n * 100).toFixed(1) + "%";

// ===========================================================================
console.log("== 1. THE CEILING: credits + every free quota <= 25% of price ==");
// ===========================================================================
console.log(
  "   plan          price   credits EUR    " +
    FREE_ALLOWANCES.map((a) => a.id.padEnd(13)).join("") +
    "TOTAL EUR   share   margin"
);
for (const row of combinedCeilingTable(BASE_CONFIG, {})) {
  const cells = row.allowances
    .map((a) => `${a.units}x=${a.costEur.toFixed(2)}`.padEnd(13))
    .join("");
  console.log(
    `   ${row.planSlug.padEnd(13)} ${String(row.priceEur ?? "--").padStart(5)}   ` +
      `${row.creditCostEur.toFixed(2).padStart(11)}    ${cells}` +
      `${row.totalCostEur.toFixed(2).padStart(9)}   ` +
      `${(row.totalShare === null ? "--" : pct(row.totalShare)).padStart(6)}  ` +
      `${row.combinedMargin === null ? "--" : row.combinedMargin.toFixed(2) + "x"}`
  );
}
for (const row of combinedCeilingTable(BASE_CONFIG, {})) {
  const detail =
    row.totalShare === null
      ? `EUR ${row.totalCostEur.toFixed(4)} vs absolute cap EUR ${FREE_PLAN_MAX_MONTHLY_COST_EUR}`
      : `${pct(row.totalShare)} of EUR ${row.priceEur} = combined ${row.combinedMargin.toFixed(2)}x, ` +
        `target ${COMBINED_MARGIN_TARGET}x — credits ${pct(row.creditShare)} + ` +
        row.allowances.map((a) => `${a.id} ${pct(a.shareOfPrice)}`).join(" + ");
  check(`${row.planSlug}: combined worst case within the ceiling`, row.withinCeiling, detail);
}

// The ceiling and the margin target are the same statement. If they ever
// stop being reciprocal, one of the two numbers below was edited alone.
check(
  "the ceiling share and the margin target are reciprocal",
  Math.abs(COMBINED_CEILING_SHARE * COMBINED_MARGIN_TARGET - 1) < 1e-12,
  `${COMBINED_CEILING_SHARE} x ${COMBINED_MARGIN_TARGET}`
);
check(
  "the margin target equals the configured floor multiplier",
  COMBINED_MARGIN_TARGET === MARGIN_MULTIPLIER_MIN,
  `target ${COMBINED_MARGIN_TARGET}, floor ${MARGIN_MULTIPLIER_MIN}`
);

// ===========================================================================
console.log("\n== 2. CROSS-PRODUCT: the ceiling holds under every permitted env ==");
// ===========================================================================
// Not a sample. Every per-plan margin the config accepts, crossed with
// every free-chat allowance an operator could plausibly type, crossed with
// every plan. The clamp inside each quota is what has to survive this —
// if the ceiling were merely a default rather than a property of the code,
// one env var would breach it and this section is where that shows up.
const MARGINS = [];
for (let m = MARGIN_MULTIPLIER_MIN; m <= MARGIN_MULTIPLIER_MAX; m += 0.5) MARGINS.push(m);
// Out-of-range values are included on purpose: they must be REJECTED (and
// fall back to a safe default), not honoured.
const MARGIN_INPUTS = [...MARGINS, 0, 1, 3.9, 10.1, 999, NaN, -5];
const ALLOWANCE_INPUTS = [0, 1, 15, 120, 300, 600, 1200, 5000, 100000, -1];
const PLAN_SLUGS = PLANS.map((p) => p.slug);
const MARGIN_ENV = {
  free: "CREDIT_MARGIN_FREE",
  starter: "CREDIT_MARGIN_STARTER",
  growth: "CREDIT_MARGIN_GROWTH",
  professional: "CREDIT_MARGIN_PROFESSIONAL",
  ultimate: "CREDIT_MARGIN_ULTIMATE",
  enterprise: "CREDIT_MARGIN_ENTERPRISE",
};
const ALLOWANCE_ENV = {
  free: "FREE_CHAT_MESSAGES_FREE",
  starter: "FREE_CHAT_MESSAGES_STARTER",
  growth: "FREE_CHAT_MESSAGES_GROWTH",
  professional: "FREE_CHAT_MESSAGES_PROFESSIONAL",
  ultimate: "FREE_CHAT_MESSAGES_ULTIMATE",
  enterprise: "FREE_CHAT_MESSAGES_ENTERPRISE",
};

let combos = 0;
let worstShare = 0;
let worstAt = null;
let breaches = 0;
for (const slug of PLAN_SLUGS) {
  for (const marginInput of MARGIN_INPUTS) {
    for (const allowanceInput of ALLOWANCE_INPUTS) {
      // The general multiplier moves too — a deployment that raises it
      // must not be able to breach the ceiling from the other direction.
      for (const general of [4, 6, 10]) {
        const env = {
          [MARGIN_ENV[slug]]: String(marginInput),
          [ALLOWANCE_ENV[slug]]: String(allowanceInput),
        };
        const config = parsePricingConfig({ CREDIT_MARGIN_MULTIPLIER: String(general) }).config;
        const row = combinedCeilingFor(slug, config, env);
        combos++;
        if (!row.withinCeiling) {
          breaches++;
          if (breaches <= 3) {
            console.log(
              `        BREACH ${slug} margin=${marginInput} allowance=${allowanceInput} ` +
                `general=${general} -> ${row.totalCostEur.toFixed(2)} EUR ` +
                `(${row.totalShare === null ? "absolute" : pct(row.totalShare)})`
            );
          }
        }
        if (row.totalShare !== null && row.totalShare > worstShare) {
          worstShare = row.totalShare;
          worstAt = { slug, marginInput, allowanceInput, general };
        }
      }
    }
  }
}
check(
  `no breach across ${combos} plan x margin x allowance x general combinations`,
  breaches === 0,
  `${breaches} breaches; worst share ${pct(worstShare)} at ${JSON.stringify(worstAt)}`
);
console.log(`        worst share seen: ${pct(worstShare)} at ${JSON.stringify(worstAt)}`);

// A credit pack lowers the account's effective per-credit rate, which is
// the other input to the credit half. It must not be able to raise the
// share, since the pack pays for its own credits.
{
  let packWorst = 0;
  for (const plan of PLANS) {
    for (const pack of plansMod.CREDIT_PACKS) {
      const packRate = plansMod.creditPackPriceEurPerCredit(pack);
      const rate = formula.effectiveCreditPriceEurForAccount(plan, packRate, BASE_CONFIG);
      const M = marginPolicy.resolveMarginFor(null, plan.slug, BASE_CONFIG, {}).margin;
      // Pack revenue funds pack credits at the same multiplier.
      const share = (pack.credits * rate) / M / pack.price;
      packWorst = Math.max(packWorst, share);
    }
  }
  check(
    `every credit pack funds its own credits within the ceiling (worst ${pct(packWorst)})`,
    packWorst <= COMBINED_CEILING_SHARE + 1e-9,
    `worst pack share ${pct(packWorst)}`
  );
}

// As SHIPPED, not under override: the override case is what the 3,600
// combinations above prove, by showing the quota clamps itself to zero
// rather than breaching. This asserts the defaults leave room at all.
check(
  "the shipped per-plan margins leave room for every declared share",
  assertDeclaredSharesFit(BASE_CONFIG, {}).ok,
  assertDeclaredSharesFit(BASE_CONFIG, {}).reason ?? ""
);

// ===========================================================================
console.log("\n== 3. SOURCE SCAN: a new free quota cannot arrive unregistered ==");
// ===========================================================================
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const SOURCES = walk("src").map((f) => f.split(path.sep).join("/"));

// --- 3a. every bypassCharge expression -------------------------------------
//
// `bypassCharge: true` is the only way a real Anthropic call settles for
// zero credits. Admin and beta accounts are not customers and are excluded
// by name; anything else is a free quota for a PAYING user and must be
// registered.
const ADMIN_BYPASS_IDENTIFIERS = new Set([
  "bypassCredits", // isAdmin || hasActiveBetaBypass, resolved at each route
  "bypass", // the same thing, named differently in lib/jobs/run-job.ts
  "isAdmin",
  "isBypass", // lib/research/run-research.ts, async form of the same check
  "plan", // `!plan` — no plan resolved, so there is no rate to charge at
]);
const REGISTERED_BYPASS_IDENTIFIERS = new Set(
  FREE_ALLOWANCES.flatMap((a) => a.bypassIdentifiers)
);

// ---------------------------------------------------------------------
// SELF-LIMITING BYPASSES: a third category, and the narrowest of the three.
//
// `cannotComplete` is not admin, and it is not a free quota either. A
// refused agent run charges nothing because the task was impossible when
// we let the user create it — but the model has ALREADY RUN, so the
// Anthropic cost is real and we absorb it. On the face of it that is
// exactly the unbounded giveaway this gate exists to stop.
//
// It is bounded, and by the code rather than by a number someone picked:
// execute-agent DISABLES the agent on the first refusal, so one agent can
// produce at most one absorbed refusal in its lifetime. The ceiling is
// therefore the plan's agent limit, which is already enforced elsewhere —
// 50 agents on Ultimate at a worst-case €0.1652 is €8.26 against €200,
// 4.1%, and only if every agent a customer ever made refused on its first
// run.
//
// THAT ARGUMENT IS THE ONLY THING MAKING THIS SAFE, so it is asserted
// rather than trusted. Delete the disable and this list stops applying:
// the bypass goes back to being unregistered and the build fails. See the
// mutation in combined-ceiling.mutation.mjs.
const SELF_LIMITING_BYPASSES = {
  cannotComplete: {
    file: "src/lib/agents/execute-agent.ts",
    // The refusal must reach `shouldDisable`, and shouldDisable must be
    // what writes status "disabled" — in the same function, so there is no
    // window in which a refusal is free and the agent still scheduled.
    requires: [
      /const shouldDisable = cannotComplete \|\|/,
      /shouldDisable \? \{ status: "disabled" as const \} : \{\}/,
      // and the schedule cleared, or a disabled agent still has a next run
      /next_run_at: shouldDisable \? null/,
    ],
  },
};
for (const [identifier, spec] of Object.entries(SELF_LIMITING_BYPASSES)) {
  const src = readFileSync(spec.file, "utf8");
  for (const [i, re] of spec.requires.entries()) {
    check(
      `${identifier} is only free because the agent is disabled in the same call (${i + 1}/${spec.requires.length})`,
      re.test(src),
      `${spec.file} no longer matches ${re} — without it the refusal is an unbounded free path`
    );
  }
}

// Comments are stripped first. A file that DOCUMENTS the rule ("every
// `bypassCharge:` expression is inventoried") is not a call site, and a
// scan that cannot tell the difference reports the documentation as a
// violation — which is exactly what the first run of this gate did.
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const bypassSites = [];
// NOT A CALL SITE, and each exclusion is one shape rather than a pattern
// broad enough to hide a real one:
//
//   `bypassCharge: boolean;`   a TYPE. SettlementResult and
//                              ExecuteAgentResult both declare the field
//                              so a caller can SEE whether an account was
//                              charged — declaring a field decides
//                              nothing. (`bypassCharge?: boolean` was
//                              already excluded by the `?`; the
//                              non-optional spelling was not, which is how
//                              adding one field to a result type read as
//                              "a feature now settles for zero credits for
//                              a paying user".)
//
//   `bypassCharge: x.bypassCharge`  a READ of a decision made elsewhere,
//                              copied out of a settlement result and into
//                              the thing the UI renders. The site that
//                              decided it is a separate match in this same
//                              scan and is still checked.
//
// Anything else — a literal, a condition, a function call — is a decision
// and is inventoried.
const NOT_A_DECISION = [
  /^boolean;?$/,
  /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.bypassCharge;?$/,
];
let excluded = 0;
for (const file of SOURCES) {
  const text = stripComments(readFileSync(file, "utf8"));
  // Only the VALUE form at a call site. `bypassCharge?: boolean` (a type)
  // and `bypassCharge,` (shorthand in the implementation) are not calls.
  for (const m of text.matchAll(/bypassCharge:\s*([^,\n}]+)/g)) {
    const expr = m[1].trim();
    if (NOT_A_DECISION.some((re) => re.test(expr))) { excluded++; continue; }
    bypassSites.push({ file, expr });
  }
}
console.log(`        ${bypassSites.length} bypassCharge call site(s) found (${excluded} type/pass-through)`);
// AN EXCLUSION MUST NEVER SHRINK COVERAGE. If a future edit makes one of
// the patterns above swallow a real decision, this is what notices: the
// number of inventoried sites can grow, never fall.
check(`at least 20 bypassCharge decisions are still inventoried (${bypassSites.length})`,
  bypassSites.length >= 20);
const unregistered = [];
for (const site of bypassSites) {
  const identifiers = site.expr.match(/[A-Za-z_$][\w$]*/g) ?? [];
  const selfLimiting = new Set(Object.keys(SELF_LIMITING_BYPASSES));
    const unknown = identifiers.filter(
    (id) =>
      !ADMIN_BYPASS_IDENTIFIERS.has(id) &&
      !REGISTERED_BYPASS_IDENTIFIERS.has(id) &&
      // Accepted ONLY while the assertions above still hold. If the
      // disable is removed those go red first, so this can never be the
      // reason an unbounded free path ships.
      !selfLimiting.has(id) &&
      // structural words in the expression, not conditions
      !["await", "true", "false", "null", "undefined", "report", "user_id"].includes(id)
  );
  if (unknown.length > 0) unregistered.push({ ...site, unknown });
}
check("every zero-charge path is admin/beta or a registered free quota", unregistered.length === 0);
if (unregistered.length > 0) {
  for (const u of unregistered) {
    console.log(`        ${u.file}: bypassCharge: ${u.expr}   unknown: ${u.unknown.join(", ")}`);
  }
  console.log("        A feature now settles for zero credits for a PAYING user.");
  console.log("        Register it in src/lib/billing/free-allowances.ts (FREE_ALLOWANCES)");
  console.log("        and declare its budget share in src/lib/billing/ceiling.ts.");
}
check("the registered bypass identifiers are all still present in src/", (() => {
  const seen = new Set(bypassSites.flatMap((s) => s.expr.match(/[A-Za-z_$][\w$]*/g) ?? []));
  return [...REGISTERED_BYPASS_IDENTIFIERS].every((id) => seen.has(id));
})(), `registered: ${[...REGISTERED_BYPASS_IDENTIFIERS].join(", ")}`);

// --- 3b. every per-plan quota table ----------------------------------------
//
// The second door. A quota does not have to bypass a charge to cost money:
// it can simply be a per-plan number that lets an account do more of
// something. Each one must be classified — either it is a free AI quota
// (registered) or it is a capacity limit whose cost is not Anthropic's.
const CLASSIFIED_PLAN_TABLES = {
  // Free AI quotas — registered in FREE_ALLOWANCES, counted in the ceiling.
  DEFAULT_FREE_CHAT_MESSAGES: { kind: "free_quota", allowanceId: "free_chat" },
  // Capacity limits. They bound storage, bandwidth or a row count — real
  // costs, but not Anthropic spend, and every AI action they gate is
  // charged in credits and therefore already inside the credit half.
  DEFAULT_AGENT_LIMITS: { kind: "capacity", why: "how many schedules may exist; each RUN is charged in credits" },
  DEFAULT_FILE_COUNT_LIMITS: { kind: "capacity", why: "row count in the file list; extraction is charged in credits" },
  DEFAULT_STORAGE_LIMITS: { kind: "capacity", why: "bytes in the private bucket — storage cost, not Anthropic cost" },
  DEFAULT_RESEARCH_LIMITS: { kind: "capacity", why: "how many Deep Research runs may START; each is charged in credits" },
  DEFAULT_INTEGRATION_LIMITS: { kind: "capacity", why: "standing OAuth grants; syncs make no unbilled model call" },
  DEFAULT_PUBLISH_LIMITS: { kind: "capacity", why: "hosted pages — bandwidth, not Anthropic cost" },
  // The only entry here that costs nothing at all to serve. It is a
  // sort order on rows the account already has: pinning makes no model
  // call, stores no bytes and creates no row. It is in this table
  // because it is shaped like the others and the scanner is right to
  // stop on anything shaped like a per-plan number.
  DEFAULT_PIN_LIMITS: { kind: "capacity", why: "how many conversations sit at the top of the sidebar — a usability floor, no cost at all" },
  // Not a quota at all.
  PLAN_MARGIN_DEFAULTS: { kind: "policy", why: "the multiplier itself — the credit half of the ceiling" },
};
const foundTables = [];
for (const file of SOURCES) {
  if (!file.startsWith("src/lib/")) continue;
  const text = stripComments(readFileSync(file, "utf8"));
  for (const m of text.matchAll(
    /export\s+const\s+([A-Za-z_$][\w$]*)\s*:\s*Record<\s*PlanSlug\s*,\s*number\s*>/g
  )) {
    foundTables.push({ file, name: m[1] });
  }
}
console.log(`        ${foundTables.length} per-plan numeric table(s) found`);
const unclassified = foundTables.filter((t) => !CLASSIFIED_PLAN_TABLES[t.name]);
check("every per-plan quota table is classified", unclassified.length === 0);
if (unclassified.length > 0) {
  for (const t of unclassified) console.log(`        ${t.file}: ${t.name}`);
  console.log("        A new per-plan allowance appeared. Say which it is in");
  console.log("        CLASSIFIED_PLAN_TABLES: a free AI quota (register it in");
  console.log("        FREE_ALLOWANCES) or a capacity limit (state what it bounds).");
}
const vanishedTables = Object.keys(CLASSIFIED_PLAN_TABLES).filter(
  (name) => !foundTables.some((t) => t.name === name)
);
check("no classified table has vanished", vanishedTables.length === 0, vanishedTables.join(", "));

// --- 3c. the ceiling is actually consulted where allowances are decided ----
const freeChatSrc = readFileSync("src/lib/billing/free-chat.ts", "utf8");
check(
  "free chat clamps against the COMBINED budget, not a private share",
  /allowanceBudgetEur\(/.test(freeChatSrc),
  "free-chat.ts must call allowanceBudgetEur() from ceiling.ts"
);

// ===========================================================================
console.log("\n== 4. REGISTRY: shares and allowances agree, both directions ==");
// ===========================================================================
const symmetry = assertRegistryMatchesShares();
check("every allowance has a declared share and vice versa", symmetry.ok, symmetry.reason ?? "");
console.log(
  `        declared: ${Object.entries(DECLARED_ALLOWANCE_SHARES)
    .map(([k, v]) => `${k}=${pct(v)}`)
    .join("  ")}`
);

// Every settlement feature a registered allowance claims to produce must
// really exist in src/ — otherwise the registry reserves budget for a
// quota that was deleted, starving the ones that are still live.
const allSource = SOURCES.map((f) => readFileSync(f, "utf8")).join("\n");
for (const a of FREE_ALLOWANCES) {
  for (const feature of a.settlementFeatures) {
    check(
      `${a.id}: settlement feature "${feature}" exists in src/`,
      allSource.includes(`"${feature}"`),
      `no occurrence of "${feature}"`
    );
  }
}

// ===========================================================================
console.log("\n== 5. ENTERPRISE: a custom price is not an unmeasurable one ==");
// ===========================================================================
const entPrice = enterpriseMinPriceEur({});
console.log(`        ENTERPRISE_MIN_PRICE_EUR default = EUR ${entPrice}`);
check("Enterprise has a price to measure against", ceilingPriceEur("enterprise", {}) === entPrice);
check(
  "Enterprise is measured at or above Ultimate's price",
  entPrice >= (PLANS.find((p) => p.slug === "ultimate")?.price ?? 0),
  `enterprise floor ${entPrice}`
);
check("a malformed ENTERPRISE_MIN_PRICE_EUR falls back to the default", (() => {
  for (const bad of ["", "abc", "0", "-1", "10", "99999999"]) {
    if (enterpriseMinPriceEur({ ENTERPRISE_MIN_PRICE_EUR: bad }) !== 400) return false;
  }
  return enterpriseMinPriceEur({ ENTERPRISE_MIN_PRICE_EUR: "750" }) === 750;
})());

// The invariant that makes Enterprise's credit half equal 1/M like every
// other plan: it must never sell credits below the cheapest published
// rate. Settlement already assumes this (effectiveCreditPriceEur falls
// back to cheapestPublishedCreditPriceEur for a custom plan) — asserted
// here so a future cheaper tier cannot silently invalidate the ceiling.
{
  const ent = PLANS.find((p) => p.slug === "enterprise");
  const entRate = formula.effectiveCreditPriceEur(ent, BASE_CONFIG);
  const cheapest = formula.cheapestPublishedCreditPriceEur(BASE_CONFIG);
  check(
    "Enterprise settles at the cheapest published rate, so its credit half is 1/M",
    Math.abs(entRate - cheapest) < 1e-12,
    `enterprise ${entRate}, cheapest published ${cheapest}`
  );
}

const entRow = combinedCeilingFor("enterprise", BASE_CONFIG, {});
console.log(
  `        enterprise at EUR ${entPrice}: credits ${entRow.creditCostEur.toFixed(2)} + ` +
    `quotas ${entRow.allowanceCostEur.toFixed(2)} = ${entRow.totalCostEur.toFixed(2)} ` +
    `(${pct(entRow.totalShare)}, ${entRow.combinedMargin.toFixed(2)}x)`
);

// ===========================================================================
console.log("\n== 6. PRICING COPY: every published number is a number the server enforces ==");
// ===========================================================================
// The other half of the same problem. A ceiling that holds is worthless if
// the page sells something else — and the page DID: Growth already gave 5x
// the Deep Research, 5x the files, 4x the storage, 2.5x the integrations
// and 3x the published sites of Starter, and said "Everything in Starter",
// because none of those numbers appeared anywhere on it.
//
// So: every comparison row must READ its number from the module that
// enforces it, that module's accessor must really be called by a route
// that refuses the action, and the row's label must exist in all ten
// locales.
const pricingSrc = readFileSync("src/app/pricing/page.tsx", "utf8");
const rowsBlock = pricingSrc.slice(
  pricingSrc.indexOf("const COMPARISON_ROWS"),
  pricingSrc.indexOf("function ComparisonCellContent")
);
const rowLabels = [...rowsBlock.matchAll(/labelKey:\s*"([^"]+)"/g)].map((m) => m[1]);
console.log(`        ${rowLabels.length} comparison rows: ${rowLabels.join(", ")}`);
check("the pricing table still has rows", rowLabels.length >= 12, `${rowLabels.length}`);
// 14 -> 12, and the two that went are a DELETION, not a regression.
// `mobileSaasBuilder` and `imageVideo` were ticks for features that do not
// exist — /dashboard/images and /videos are CRUD forms with no model call,
// and `ai_apps` is a four-field notes table. A row that sells nothing is
// worse than a missing row, so they are named here: this floor must never
// be satisfied by bringing one of them back.
check(
  "and neither of the two deleted phantom features is back",
  rowLabels.filter((l) => l === "mobileSaasBuilder" || l === "imageVideo"),
  []
);

// Each quantitative claim, and the route that would refuse the action.
const ENFORCED_ROWS = {
  freeChatMessages: { accessor: "freeChatAllowance(", enforcedIn: "src/lib/billing/free-chat-usage.ts" },
  aiAgents: { accessor: "maxAgentsForPlan(", enforcedIn: "src/app/api/agents/route.ts" },
  deepResearch: { accessor: "maxResearchRunsForPlan(", enforcedIn: "src/app/api/research/route.ts" },
  // The caps moved into the shared ingest when uploads gained a second
  // path (browser → storage → /api/files/register): ONE implementation,
  // called by both routes, instead of a copy per route that can drift.
  files: { accessor: "maxFilesForPlan(", enforcedIn: "src/lib/files/ingest.ts" },
  storage: { accessor: "maxStorageBytesForPlan(", enforcedIn: "src/lib/files/ingest.ts" },
  integrations: {
    accessor: "maxIntegrationsForPlan(",
    enforcedIn: "src/app/api/integrations/[provider]/connect/route.ts",
  },
  publishedSites: {
    accessor: "maxPublishedSitesForPlan(",
    enforcedIn: "src/app/api/websites/[id]/publish/route.ts",
  },
};
for (const [labelKey, { accessor, enforcedIn }] of Object.entries(ENFORCED_ROWS)) {
  check(`pricing shows "${labelKey}"`, rowLabels.includes(labelKey));
  check(
    `"${labelKey}" reads ${accessor}) rather than a typed-in number`,
    rowsBlock.includes(accessor),
    `not found in COMPARISON_ROWS`
  );
  // free-chat-usage.ts reaches the allowance through freeChatAllowanceForAccount.
  const enforcingSrc = readFileSync(enforcedIn, "utf8");
  const enforcingName = labelKey === "freeChatMessages" ? "freeChatAllowanceForAccount(" : accessor;
  check(
    `"${labelKey}" is really refused by ${enforcedIn}`,
    enforcingSrc.includes(enforcingName),
    `${enforcingName} not called there`
  );
}

// No literal text in a cell's displayed value at all — neither a number
// nor a word. A row that hardcodes "5 agents" renders perfectly and is a
// promise nothing keeps (the same shape as the notification bell that
// rendered beautifully hard-coded); a row that hardcodes "/seat" renders
// English inside a Greek page. Both forms are caught here because `text:`
// may only ever be an expression.
const literalCells = [
  ...rowsBlock.matchAll(/text:\s*(?:"([^"]*)"|`([^`]*)`)/g),
]
  .map((m) => m[1] ?? m[2])
  .filter((s) => s.trim() !== "");
check(
  "no comparison cell displays hardcoded text",
  literalCells.length === 0,
  literalCells.join(" | ")
);

// NO ENGLISH SENTENCE LITERALS ANYWHERE ON THIS PAGE.
//
// Two survived every existing i18n gate: the team-seat notes, built from a
// ternary inside a JSX text node, which check-i18n.js (which never opens a
// source file) and i18n-coverage.test.mjs (which looks for t("key") calls)
// both structurally cannot see. They rendered English inside the Greek
// page — on the page a non-English visitor is most likely to see first.
// Found by loading /pricing in a real browser with NEXT_LOCALE=el, which
// is the only check that was ever going to find them.
{
  const withoutComments = pricingSrc
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  // Any quoted or backticked string carrying three or more consecutive
  // alphabetic words of 3+ letters. Deliberately not anchored to a capital
  // letter: the second of the two literals this check exists for started
  // with "+ ${CURRENCY_SYMBOL}", and a capital-anchored pattern found only
  // one of the pair — a half-check that would have passed the day after
  // someone re-added the other.
  const WORDS = /(?:^|[^A-Za-z])[a-z]{3,}(?:[ ,][a-z]{3,}){2,}/i;
  // ONE predicate, used by the scan AND by the self-test below, so the two
  // cannot drift into checking different things.
  const isEnglishSentence = (s) =>
    WORDS.test(s) &&
    // Tailwind class lists and other all-token strings.
    !/^[\w:\-[\]. ]+$/.test(s) &&
    // Module specifiers and URLs — a path, not prose.
    !/^(?:[@.]?\/|https?:)/.test(s) &&
    // The page's own SEO description: metadata, not UI copy.
    !s.startsWith("Ionexa AI pricing");

  const quoted = [...withoutComments.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((m) => m[2]);
  const sentences = quoted.filter(isEnglishSentence);
  check(
    "no English sentence is hardcoded in the pricing page",
    sentences.length === 0,
    sentences.join(" | ")
  );
  // The check must be able to FAIL. Both literals that shipped are fed
  // through the same predicate here, so an edit that loosens it into
  // uselessness fails immediately rather than silently — and so that the
  // capital-anchored first draft, which found only one of the pair, could
  // not have been mistaken for a working check.
  const REGRESSIONS = [
    "Unlimited team seats included — no per-member charge",
    "+ €20/month per team member — each member gets full access at your plan's tier",
  ];
  const caught = REGRESSIONS.filter(isEnglishSentence);
  check(
    "…and that check really catches BOTH literals that shipped",
    caught.length === REGRESSIONS.length,
    `only caught: ${caught.join(" | ")}`
  );
}

// Labels and in-cell words, in all ten locales.
const LOCALES = ["en", "el", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);
for (const labelKey of rowLabels) {
  const missing = LOCALES.filter((l) => !messages[l].pricing?.rows?.[labelKey]);
  check(`pricing.rows.${labelKey} exists in all 10 locales`, missing.length === 0, missing.join(", "));
}
for (const key of ["seatNote.included", "seatNote.perMember"]) {
  const [group, name] = key.split(".");
  const missing = LOCALES.filter((l) => !messages[l].pricing?.[group]?.[name]);
  check(`pricing.${key} exists in all 10 locales`, missing.length === 0, missing.join(", "));
  const untranslated = ["el", "ja", "ar"].filter(
    (l) => messages[l].pricing?.[group]?.[name] === messages.en.pricing?.[group]?.[name]
  );
  check(`pricing.${key} is really translated into el/ja/ar`, untranslated.length === 0, untranslated.join(", "));
}
// A single English WORD in a cell is invisible to the sentence scanner
// above — "/seat" survived it and was only found by screenshotting the
// Greek page. Every cell word is enumerated here instead of pattern-matched.
for (const word of ["unlimited", "included", "custom", "perSeat"]) {
  const missing = LOCALES.filter((l) => !messages[l].pricing?.values?.[word]);
  check(`pricing.values.${word} exists in all 10 locales`, missing.length === 0, missing.join(", "));
  const untranslated = ["el", "ja", "ar"].filter(
    (l) => messages[l].pricing?.values?.[word] === messages.en.pricing?.values?.[word]
  );
  check(`pricing.values.${word} is really translated into el/ja/ar`, untranslated.length === 0, untranslated.join(", "));
}

// Both directions on the plan feature bullets: every textKey a plan lists
// must exist, and every key that exists must be listed by a plan. The
// second half is what catches a key left behind by a policy change —
// "Unlimited AI agents" outlived the plan that offered it by months.
const usedFeatureKeys = new Set(PLANS.flatMap((p) => p.features.map((f) => f.textKey)));
for (const key of usedFeatureKeys) {
  const missing = LOCALES.filter((l) => !messages[l].pricing?.features?.[key]);
  check(`pricing.features.${key} exists in all 10 locales`, missing.length === 0, missing.join(", "));
}
const orphanFeatureKeys = Object.keys(messages.en.pricing?.features ?? {}).filter(
  (k) => !usedFeatureKeys.has(k)
);
check(
  "no orphan pricing.features key — a claim no plan makes any more",
  orphanFeatureKeys.length === 0,
  orphanFeatureKeys.join(", ")
);

// The claim that started this: Growth is NOT "Everything in Starter".
// Read from the enforcing modules, so it is the server's opinion and not
// the page's.
{
  const fileLimits = await loadTs("src/lib/files/limits.ts");
  const integrationLimits = await loadTs("src/lib/integrations/limits.ts");
  const publishLimits = await loadTs("src/lib/publishing/publish-limits.ts");
  const quantitative = {
    deepResearch: fileLimits.maxResearchRunsForPlan,
    files: fileLimits.maxFilesForPlan,
    storage: fileLimits.maxStorageBytesForPlan,
    integrations: integrationLimits.maxIntegrationsForPlan,
    publishedSites: publishLimits.maxPublishedSitesForPlan,
  };
  console.log("        limit          starter -> growth   ratio");
  const better = [];
  for (const [name, fn] of Object.entries(quantitative)) {
    const s = fn("starter");
    const g = fn("growth");
    console.log(
      `        ${name.padEnd(15)}${String(s).padStart(9)} -> ${String(g).padEnd(9)} ${(g / s).toFixed(1)}x`
    );
    if (g > s) better.push(name);
  }
  check(
    `Growth beats Starter on all ${Object.keys(quantitative).length} quantitative limits`,
    better.length === Object.keys(quantitative).length,
    `only ${better.join(", ")}`
  );
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failures.length === 0 ? 0 : 1);
