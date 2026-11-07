// «ΜΟΝΟ ΕΥΡΩΠΗ» (agent/mistral, 2026-11-07): an account's own setting
// (user_credits.eu_only_ai, dashboard/settings) promising that no AI call
// this product makes for it leaves the EU. The promise is kept in exactly
// one place — lib/ai/providers/registry.ts's resolveChain, which a request
// for this account's runCompletion() always goes through — so this file
// checks the two ways that promise could quietly stop being true:
//
//   1. A runCompletion() CALLER THAT NEVER REACHES THE SETTING. complete.ts
//      resolves euOnly from `options.userId` when `options.euOnly` is not
//      passed explicitly (lib/ai/providers/eu-only.ts), so a caller that
//      passes NEITHER is a call this product cannot place against the
//      account's own promise — it is served by whichever provider the
//      chain picks with euOnly always false, "Μόνο Ευρώπη" or not. Every
//      runCompletion() call site in src/ is inventoried and must carry one
//      of the two.
//
//   2. THE CHAIN ITSELF, WHICH AN OPERATOR'S OWN AI_PROVIDER_ORDER CANNOT
//      QUIETLY EMPTY. DEFAULT_PROVIDER_ORDER is anthropic alone, and an
//      operator's AI_PROVIDER_ORDER is free to name no EU provider either
//      — neither is this account's decision. resolveChain appends every
//      EU provider (PROVIDER_REGION, catalog.ts) to the chain whenever
//      euOnly is true, specifically so that is never the reason the
//      promise fails. Section 2 below exercises resolveChain directly,
//      with a fake env, and is the regression for the exact gap this file
//      was written to close: before it, a deployment with MISTRAL_API_KEY
//      set and valid, and AI_PROVIDER_ORDER left at its default, still
//      got `eu_only_blocked` on every call for an account that turned the
//      setting on — mistral was never a candidate to filter in, because
//      the loop only ever considered `configured`, and `configured`
//      defaulted to ["anthropic"].
//
// Run: node scripts/tests/eu-only.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
};

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

// Balanced-paren extraction of the whole runCompletion(...) call, not a
// fixed character window: a system prompt long enough to push `userId`
// past a few hundred characters is exactly how this check would have
// looked green while being blind — src/app/api/coding/run/route.ts's own
// call is built that way.
function callsOf(fnName, src) {
  const calls = [];
  const re = new RegExp(`\\b${fnName}\\(`, "g");
  let m;
  while ((m = re.exec(src))) {
    const openIdx = m.index + fnName.length;
    let depth = 0,
      i = openIdx,
      closeIdx = -1;
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") {
        depth--;
        if (depth === 0) {
          closeIdx = i;
          break;
        }
      }
    }
    if (closeIdx !== -1) calls.push(src.slice(m.index, closeIdx + 1));
  }
  return calls;
}

// ---------------------------------------------------------------------
console.log("== 1. every runCompletion() caller reaches the account's own setting ==");
const files = walk("src")
  .map((f) => f.split(path.sep).join("/"))
  .filter((f) => !f.includes("lib/ai/providers/")); // the router's own definition, not a caller
const callers = files.filter((f) => /\brunCompletion\(/.test(readFileSync(f, "utf8")));
ok(`runCompletion() has callers to check (${callers.length})`, callers.length > 0);

const missing = [];
for (const f of callers) {
  const src = readFileSync(f, "utf8");
  const calls = callsOf("runCompletion", src);
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    if (!/\buserId\b/.test(call) && !/\beuOnly\b/.test(call)) {
      missing.push(calls.length > 1 ? `${f} [#${i + 1}]` : f);
    }
  }
}
ok("no runCompletion() call site is unreachable from «Μόνο Ευρώπη»", missing.length === 0, missing.join(", "));

// ---------------------------------------------------------------------
console.log("\n== 2. resolveChain itself: the chain an operator's env cannot empty ==");
const registry = await loadTs("src/lib/ai/providers/registry.ts");
const { resolveChain, EU_ONLY_SKIP_REASON, PROVIDER_KEY_ENV_VARS } = registry;

const ALL_KEYS = Object.fromEntries(Object.values(PROVIDER_KEY_ENV_VARS).map((v) => [v, "k"]));

{
  // The exact regression: AI_PROVIDER_ORDER left unset (so `configured`
  // is DEFAULT_PROVIDER_ORDER, anthropic alone), every key set including
  // Mistral's, and this account's «Μόνο Ευρώπη» on.
  const chain = resolveChain({ env: ALL_KEYS, purpose: "chat", euOnly: true });
  ok("...with every key set and AI_PROVIDER_ORDER left at its default, the chain still reaches mistral",
    chain.order.includes("mistral"), chain.order.join(","));
  ok("...and the account is not told eu_only_blocked when an EU provider is actually usable",
    chain.euOnlyBlocked === false);
  // DEFAULT_PROVIDER_ORDER is anthropic alone, so openai/google/groq were
  // never candidates here regardless of «Μόνο Ευρώπη» — the default chain
  // was always just anthropic, and this fix appends only EU providers to
  // it. anthropic is the one non-EU provider actually in the chain being
  // filtered, and it is skipped for exactly this reason.
  ok("...and anthropic (the one non-EU provider actually in the chain) is skipped, naming the EU-only reason",
    chain.skipped.some((s) => s.provider === "anthropic" && s.reason === EU_ONLY_SKIP_REASON));
}

{
  // The honest failure: the setting is on, but there is no EU provider to
  // route to at all (no MISTRAL_API_KEY). euOnlyBlocked must be true, and
  // ONLY this reason — nothing else emptied the chain first.
  const noMistralKey = Object.fromEntries(Object.entries(ALL_KEYS).filter(([k]) => k !== "MISTRAL_API_KEY"));
  const chain = resolveChain({ env: noMistralKey, purpose: "chat", euOnly: true });
  ok("...with no EU provider configured at all, the chain is empty",
    chain.order.length === 0, chain.order.join(","));
  ok("...and euOnlyBlocked says so, which is the sentence complete.ts turns into eu_only_blocked",
    chain.euOnlyBlocked === true);
}

{
  // euOnlyBlocked must stay FALSE for a chain that was always going to be
  // empty for an unrelated reason — no keys at all — so the account is
  // not told "turn off Μόνο Ευρώπη" when the real problem is no key
  // anywhere. This is the exact distinction registry.ts's own comment on
  // `viableButNotEu` promises complete.ts can rely on.
  const chain = resolveChain({ env: {}, purpose: "chat", euOnly: true });
  ok("...and with NO key at all, euOnlyBlocked is false — a different failure (no_provider), not this one",
    chain.order.length === 0 && chain.euOnlyBlocked === false);
}

{
  // An account with the setting OFF is completely unaffected: mistral is
  // not force-added to a chain that never asked to be EU-only, and an
  // operator who explicitly ordered providers still gets exactly that
  // order back.
  const chain = resolveChain({ env: ALL_KEYS, purpose: "chat", euOnly: false });
  ok("...with the setting off, the chain is unaffected — DEFAULT_PROVIDER_ORDER, not every EU provider appended",
    chain.order.join(",") === "anthropic");

  const ordered = resolveChain({
    env: { ...ALL_KEYS, AI_PROVIDER_ORDER: "groq,openai" },
    purpose: "chat",
    euOnly: false,
  });
  ok("...and an operator's own explicit order is untouched when the setting is off",
    ordered.order.join(",") === "groq,openai");
}

{
  // euOnly=true with an operator's own order that ALREADY names an EU
  // provider: the explicit order decides priority, mistral is not
  // duplicated or reordered to the front.
  const chain = resolveChain({
    env: { ...ALL_KEYS, AI_PROVIDER_ORDER: "mistral,groq" },
    purpose: "chat",
    euOnly: true,
  });
  ok("...and an explicit order that already names an EU provider keeps its own priority, not re-appended",
    chain.order.join(",") === "mistral", chain.order.join(","));
}

// ---------------------------------------------------------------------
console.log("\n== 3. the resolver that bridges userId to the setting fails OPEN on a read error ==");
// resolveAccountEuOnly (eu-only.ts) must never let a database hiccup turn
// into every account silently losing «Μόνο Ευρώπη» mid-incident — but it
// must also never let a hiccup turn into every call silently leaving the
// EU for an account that turned the setting ON. Reading its source
// rather than its behaviour: the function dynamically imports the admin
// client (ΛΘ-17 — see complete.ts's own static-import gate,
// ai-providers.test.mjs §0b) so it cannot be exercised through loadTs
// without a live Supabase client, and faking one would test the fake.
const euOnlySrc = readFileSync("src/lib/ai/providers/eu-only.ts", "utf8");
ok('a lookup that throws is caught and treated as "off" for this call, not propagated',
  /catch[\s\S]{0,400}return false/.test(euOnlySrc));
ok('a Supabase error on the read is treated as "off" for this call, not propagated',
  /if \(error\)[\s\S]{0,200}return false/.test(euOnlySrc));
ok("the admin client is imported dynamically, not at the top of the file (ΛΘ-17)",
  !/^import.*supabase-js/m.test(euOnlySrc) && /await import\(.*supabase\/admin/.test(euOnlySrc));
ok('the module\'s only top-level import is "server-only", the one marker ΛΘ-17 exempts',
  /^import "server-only";/m.test(euOnlySrc));

// ---------------------------------------------------------------------
console.log("\n== 4. the setting is wired end to end ==");
const migration = readFileSync("supabase/migrations/20261122000000_eu_only_ai.sql", "utf8");
ok("the migration adds the column, default false", /eu_only_ai boolean not null default false/.test(migration));
ok("the migration says how to undo it", /-- How to undo:/.test(migration));

const route = readFileSync("src/app/api/settings/eu-only/route.ts", "utf8");
ok("GET reads only the caller's own row", /\.eq\("user_id", user\.id\)/.test(route));
ok("PATCH writes through the admin client, filtered to the caller's own id",
  /createAdminClient\(\)[\s\S]{0,120}\.eq\("user_id", user\.id\)/.test(route));
ok("PATCH is rate-limited", /checkRateLimit/.test(route));

const settings = readFileSync("src/components/settings/eu-only-settings.tsx", "utf8");
ok("the settings toggle PATCHes the real route", /fetch\("\/api\/settings\/eu-only"/.test(settings));

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n  " + failures.join("\n  "));
  process.exit(1);
}
