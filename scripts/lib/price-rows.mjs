/*
 * THE ROWS OF scripts/price-table.mjs, computed once for the table and
 * for scripts/tests/cost-before.test.mjs — so the gate holds the same
 * numbers the owner is shown, not a second calculation of them.
 *
 * Everything is read out of the code; price-table.mjs's header says where
 * each column comes from. Importing this module computes the rows.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadTs } from "../tests/load-ts.mjs";
import { SHOWN_BEFORE } from "./cost-shown-before.mjs";

const estimate = await loadTs("src/lib/billing/estimate.ts");
const formula = await loadTs("src/lib/billing/credit-formula.ts");
const cfgMod = await loadTs("src/lib/billing/pricing-config.ts");
const plansMod = await loadTs("src/lib/billing/plans.ts");
const policy = await loadTs("src/lib/billing/margin-policy.ts");
const catalogMod = await loadTs("src/lib/billing/feature-catalog.ts");
const models = await loadTs("src/lib/ai-models.ts");

export const config = cfgMod.DEFAULTS;
export const MODEL = models.WEBSITE_BUILDER_MODEL;
export const INPUT_CHARS = 300;
export const PLANS = ["free", "starter", "growth", "professional", "ultimate"];
const PLAN_ORDER = ["free", "starter", "growth", "professional", "ultimate", "enterprise"];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const files = walk("src").map((f) => ({ f, src: readFileSync(f, "utf8") }));
const ESTIMATOR = /\bestimateForAction\s*\(|\buseCostEstimate\s*\(/;
const apiFiles = files.filter(({ f }) => f.startsWith("src/app/api/") && ESTIMATOR.test(readFileSync(f, "utf8")));
const uiFiles = files.filter(({ f, src }) => !f.startsWith("src/app/api/") && !f.startsWith("src/lib/") && ESTIMATOR.test(src));

// Web searches are priced per query on top of tokens, and the routes say
// how many they reserve for: `expectedWebSearches:` beside the profile
// name. Read from there, so Deep Research is not priced as though it
// searched nothing. An identifier is resolved from the one module that
// exports one today; anything else is reported, not guessed.
const agentDepth = await loadTs("src/lib/agents/agent-depth.ts");
const DEPTH_ACTIONS = { agentRunSimple: "simple", agentRunStandard: "standard", agentRunDeep: "deep" };
const researchLimits = await loadTs("src/lib/research/research-limits.ts");
const KNOWN_SEARCH_CONSTANTS = { RESEARCH_MAX_SEARCHES: researchLimits.RESEARCH_MAX_SEARCHES };
function searchesFor(action) {
  // An agent run's searches come from its depth (lib/agents/execute-agent.ts
  // passes spec.maxSearches when the task needs the web) — the larger of
  // the two numbers the depth picker shows.
  if (DEPTH_ACTIONS[action]) return agentDepth.AGENT_DEPTH_SPECS[DEPTH_ACTIONS[action]].maxSearches;
  const found = [];
  for (const { src } of apiFiles) {
    let at = src.indexOf(`"${action}"`);
    while (at !== -1) {
      // Only this call's own params object: from the profile name to the
      // first closing brace. A wider window reads the NEXT call's searches
      // (api/research prices its planning call and its run side by side).
      const end = src.indexOf("}", at);
      const m = src.slice(at, end === -1 ? at + 400 : end).match(/expectedWebSearches:\s*([^,\n}]+)/);
      if (m) {
        const expr = m[1];
        const constant = Object.keys(KNOWN_SEARCH_CONSTANTS).find((k) => expr.includes(k));
        const digits = (expr.match(/\d+/g) ?? []).map(Number);
        // A conditional (`isFreeMessage ? 0 : 1`) is priced at its larger
        // branch, the one a reservation has to cover.
        found.push(constant ? KNOWN_SEARCH_CONSTANTS[constant] : digits.length ? Math.max(...digits) : NaN);
      }
      at = src.indexOf(`"${action}"`, at + 1);
    }
  }
  return found.length ? Math.max(...found) : 0;
}

// THE MODEL THE CALL SITE USES, not one constant for every row. Agent
// runs are priced on their depth's own model (Haiku, Sonnet, Opus) and a
// table that priced them all on the Website Builder's would be wrong by
// the ratio between those prices. Read from the first call site's
// `model:`, a string literal or a constant resolved through `const X =`
// declarations anywhere in src (two hops: `const MODEL = CHAT_MODEL`).
function resolveConst(name, hops = 0) {
  if (hops > 3) return null;
  for (const { src } of files) {
    const m = src.match(new RegExp(`(?:export\\s+)?const\\s+${name}\\s*(?::[^=]+)?=\\s*("([^"]+)"|([A-Z_][A-Z0-9_]*))\\s*;`));
    if (m) return m[2] ?? resolveConst(m[3], hops + 1);
  }
  return null;
}
function modelFor(action) {
  if (DEPTH_ACTIONS[action]) return { model: agentDepth.AGENT_DEPTH_SPECS[DEPTH_ACTIONS[action]].model, from: "lib/agents/agent-depth.ts" };
  for (const { f, src } of files) {
    if (f.startsWith("src/lib/billing/") || f.startsWith("src/components/")) continue;
    const at = src.indexOf(`estimateForAction(\n      "${action}"`) !== -1
      ? src.indexOf(`estimateForAction(\n      "${action}"`)
      : src.search(new RegExp(`estimateForAction\\(\\s*"${action}"`));
    if (at === -1) continue;
    const end = src.indexOf("}", at);
    const m = src.slice(at, end).match(/model:\s*(?:"([^"]+)"|([A-Z_][A-Z0-9_]*))/);
    if (!m) continue;
    const model = m[1] ?? resolveConst(m[2]);
    if (model) return { model, from: f };
  }
  return { model: MODEL, from: "not found at a call site — priced on WEBSITE_BUILDER_MODEL" };
}

const routeOf = (f) => f.replace(/^src\/app\/api\//, "").replace(/\/route\.ts$/, "");
const catalog = catalogMod.FEATURE_CATALOG ?? catalogMod.FEATURES ?? catalogMod.default;
if (!Array.isArray(catalog)) {
  throw new Error("lib/billing/feature-catalog.ts exports no FEATURE_CATALOG array — the tier column cannot be read.");
}

export const rows = [];
for (const action of Object.keys(estimate.ACTION_PROFILES)) {
  const needle = `"${action}"`;
  const feature = policy.ACTION_TO_FEATURE[action] ?? null;
  const searches = searchesFor(action);
  const { model, from: modelFrom } = modelFor(action);
  const base = { model, inputChars: INPUT_CHARS, expectedWebSearches: searches };
  const cost = estimate.estimateForAction(action, { ...base, planSlug: "growth" }, config);
  const eur = cost.estimatedUsd * config.usdToEurRate;
  const credits = {};
  for (const slug of PLANS) {
    const rate = formula.effectiveCreditPriceEurForAccount(plansMod.getPlan(slug), null, config);
    credits[slug] = estimate.estimateForAction(action, { ...base, planSlug: slug }, config, rate).estimatedCredits;
  }
  const growthRate = formula.effectiveCreditPriceEurForAccount(plansMod.getPlan("growth"), null, config);
  const at4 = estimate.estimateForAction(action, base, config, growthRate, 4).estimatedCredits;

  const routes = apiFiles.filter(({ src }) => src.includes(needle)).map(({ f }) => routeOf(f));
  const claimed = catalog.filter((e) => (e.routes ?? []).some((r) => routes.includes(r)));
  // An agent run needs an agent, so it is used at the tier of the entry
  // that sells agents; the run itself is priced in lib/, not in a route.
  if (DEPTH_ACTIONS[action] || action === "agentRun") {
    for (const e of catalog.filter((e) => e.id === "aiAgents")) if (!claimed.includes(e)) claimed.push(e);
  }
  const tier = claimed.length
    ? claimed.map((e) => e.minPlan).sort((a, b) => PLAN_ORDER.indexOf(a) - PLAN_ORDER.indexOf(b))[0]
    : null;
  // Named in a screen that runs the estimator itself, OR quoted by the
  // server: a screen that calls one of this profile's routes and renders
  // the `estimate` that route returns (Deep Research works this way — the
  // number is computed where the reservation is, and shown from there).
  const named = uiFiles.filter(({ src }) => src.includes(needle)).map(({ f }) => f);
  const quoting = routes.filter((r) =>
    apiFiles.some(({ f, src }) => routeOf(f) === r && /\bestimate\s*:/.test(src)),
  );
  const quotedIn = files
    .filter(({ f }) => !f.startsWith("src/app/api/") && !f.startsWith("src/lib/"))
    .filter(({ src }) =>
      quoting.some((r) => {
        const prefix = `/api/${r.split("/[")[0]}`;
        return (src.includes(`"${prefix}"`) || src.includes(`\`${prefix}`)) && /\.estimate\b/.test(src);
      }),
    )
    .map(({ f }) => f);
  const declared = SHOWN_BEFORE[action] ? [SHOWN_BEFORE[action].file] : [];
  const shownIn = [...new Set([...named, ...quotedIn, ...declared])];

  rows.push({
    action,
    feature,
    eur,
    credits,
    growthAt4: at4,
    model,
    modelFrom,
    searches,
    tier,
    tierFrom: claimed.map((e) => e.id),
    routes,
    shownIn,
    large: PLANS.some((p) => formula.needsLargeActionConfirmation(credits[p], config)),
  });
}

