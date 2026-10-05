// THE MODEL TABLE IS CONFIGURATION, AND EVERY MODEL THE APP NAMES IS REAL
// (BUILD-SPECS 2.13 Β, QUEUE E.2).
//
// Scenario 6: a new model enters with a row in the table and no code
// change. Scenario 7, in the form it can take before the quality set
// exists: a model with no measured quality is never the primary unless it
// is the tier's incumbent — the model the app already runs on.
//
// And the bug the inventory found (docs/FEATURES.md, "Τι βρήκα" 2): the
// deep agent asked for claude-opus-4-5, the catalog did not have it, and
// runCompletion quietly served Sonnet. Section 4 ranges over every Claude
// model id written in src/, not over the one that broke.
//
// Run: node scripts/tests/router-model-table.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const mt = await loadTs("src/lib/ai/routing/model-table.ts");
const catalog = await loadTs("src/lib/ai/providers/catalog.ts");
const tiers = await loadTs("src/lib/ai/routing/tiers.ts");
const cat = await loadTs("src/lib/ai/routing/categorize.ts");
const DEFAULT = JSON.parse(readFileSync("src/lib/ai/routing/model-table.json", "utf8"));

// =====================================================================
console.log("\n== 1. THE DEFAULT TABLE ==");
// =====================================================================
const problems = mt.validateModelTable(DEFAULT);
ok("the shipped table validates", problems.length === 0, JSON.stringify(problems));
const loaded = mt.loadModelTable({});
ok("with no AI_MODEL_TABLE the default is used, and nothing was refused", loaded.source === "default" && loaded.rejected === null);
const expanded = mt.expandModelTable(loaded.table);
ok("every category × tier has a row (10 × 4)", expanded.length === cat.CATEGORIES.length * tiers.TIERS.length, String(expanded.length));
for (const tier of tiers.TIERS) {
  const row = loaded.table.tiers[tier];
  const p = catalog.catalogModel(row.primary);
  const f = catalog.catalogModel(row.fallback);
  ok(`${tier}: the fallback is from another provider`, p && f && p.provider !== f.provider, `${row.primary} / ${row.fallback}`);
}
for (const r of expanded.filter((x) => x.category === "chat")) {
  const m = catalog.catalogModel(r.primary);
  ok(
    `chat:${r.tier} prints its price per 1,000 tokens from the catalog`,
    m && r.inputPer1k === m.inputPerMTok / 1000 && r.outputPer1k === m.outputPerMTok / 1000,
    `${r.inputPer1k} / ${r.outputPer1k}`,
  );
}
ok("the JSON carries no prices of its own (one price list)", !/PerMTok|price|usd/i.test(JSON.stringify(DEFAULT.tiers)));

// =====================================================================
console.log("\n== 2. SCENARIO 6: A NEW MODEL IS ONE ROW ==");
// =====================================================================
const withRow = {
  ...DEFAULT,
  version: "test-2026-10-05",
  overrides: { "translation:simple": { primary: "openai/gpt-5-mini", fallback: "claude-haiku-4-5", maxWaitMs: 20000, quality: { score: 0.93, measuredAt: "2026-10-05" } } },
};
const viaEnv = mt.loadModelTable({ [mt.MODEL_TABLE_ENV_VAR]: JSON.stringify(withRow) });
ok("AI_MODEL_TABLE replaces the table without a code change", viaEnv.source === "env" && viaEnv.rejected === null && viaEnv.table.version === "test-2026-10-05");
ok("the row serves its own combination", mt.rowFor(viaEnv.table, "translation", "simple").primary === "openai/gpt-5-mini");
ok("...and no other", mt.rowFor(viaEnv.table, "translation", "complex").primary === DEFAULT.tiers.complex.primary && mt.rowFor(viaEnv.table, "chat", "simple").primary === DEFAULT.tiers.simple.primary);

// =====================================================================
console.log("\n== 3. A BAD TABLE IS REFUSED, AND THE DEFAULT HOLDS ==");
// =====================================================================
const refuse = (name, table, pattern) => {
  const r = mt.loadModelTable({ [mt.MODEL_TABLE_ENV_VAR]: typeof table === "string" ? table : JSON.stringify(table) });
  const text = JSON.stringify(r.rejected ?? []);
  ok(name, r.source === "default" && r.rejected !== null && pattern.test(text), text);
};
refuse("not JSON", "{ nope", /not valid JSON/);
refuse("a primary the catalog does not know", { ...DEFAULT, tiers: { ...DEFAULT.tiers, simple: { ...DEFAULT.tiers.simple, primary: "claude-imaginary-9" } } }, /not in the catalog/);
refuse("a fallback weaker than its primary", { ...DEFAULT, tiers: { ...DEFAULT.tiers, expert: { ...DEFAULT.tiers.expert, fallback: "openai/gpt-5-mini" } } }, /weaker than primary/);
refuse("a wait outside 5–120 s", { ...DEFAULT, tiers: { ...DEFAULT.tiers, complex: { ...DEFAULT.tiers.complex, maxWaitMs: 600000 } } }, /maxWaitMs/);
refuse("an override key that is not category:tier", { ...DEFAULT, overrides: { "poetry:simple": DEFAULT.tiers.simple } }, /category:tier/);
refuse("a quality score without its date", { ...DEFAULT, overrides: { "code:simple": { ...DEFAULT.tiers.simple, quality: { score: 0.9 } } } }, /measuredAt/);

// =====================================================================
console.log("\n== 4. EVERY MODEL THE APP NAMES IS IN THE CATALOG ==");
// =====================================================================
// The files that LIST models rather than use them: the price list, the
// cache minimums, and the catalog itself.
const LISTS = new Set(["src/lib/billing/model-pricing.ts", "src/lib/ai/cached-system.ts", "src/lib/ai/providers/catalog.ts"]);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const uses = [];
for (const file of walk("src")) {
  if (LISTS.has(file)) continue;
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/"(claude-[a-z0-9.-]+)"/g)) uses.push({ file, id: m[1] });
}
ok("the scan found the model ids the app names", uses.length >= 20, `${uses.length} found`);
const unknown = uses.filter((u) => catalog.catalogModel(u.id) === null);
ok("every one resolves in the catalog", unknown.length === 0, unknown.map((u) => `${u.file}: ${u.id}`).join("; "));
const depth = await loadTs("src/lib/agents/agent-depth.ts");
ok(
  "the deep agent's model is a LARGE model, so runCompletion keeps it",
  catalog.catalogModel(depth.AGENT_DEPTH_SPECS.deep.model)?.tier === "large",
  depth.AGENT_DEPTH_SPECS.deep.model,
);

// =====================================================================
console.log("\n== 5. SCENARIO 7, BEFORE THE QUALITY SET ==");
// =====================================================================
// A primary with no measured quality must be the tier's incumbent. When
// E.4 measures a cheaper model, its row carries the score and the date,
// and this check lets it through; until then, nothing cheaper can be
// slipped into the table without a number behind it.
const unmeasured = (table) =>
  mt.expandModelTable(table).filter((r) => r.quality === null && r.primary !== tiers.TIER_MODELS[r.tier]);
ok("in the shipped table every unmeasured primary is the incumbent", unmeasured(loaded.table).length === 0, JSON.stringify(unmeasured(loaded.table).map((r) => `${r.category}:${r.tier}`)));
const sneaky = { ...DEFAULT, overrides: { "chat:complex": { ...DEFAULT.tiers.complex, primary: "groq/llama-3.3-70b-versatile", fallback: "claude-sonnet-4-6" } } };
ok("a cheaper primary with no score is caught", unmeasured(sneaky).length === 1);
ok("the check is exported for E.4 to use", typeof mt.unmeasuredChallengers === "function" && mt.unmeasuredChallengers(sneaky).length === 1);
refuse("...and such a table is refused at load", sneaky, /no measured quality/);
const measured = { ...DEFAULT, overrides: { "chat:complex": { ...sneaky.overrides["chat:complex"], quality: { score: 0.91, measuredAt: "2026-10-05" } } } };
ok("the same row WITH a measured score is accepted", mt.loadModelTable({ [mt.MODEL_TABLE_ENV_VAR]: JSON.stringify(measured) }).source === "env");

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILED: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
