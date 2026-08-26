// Grandfathering: nobody who was already paying loses anything.
//
// The combined-ceiling change lowered both halves of what free chat grants
// — the message COUNT (120/300/600/1200 -> 43/107/215/430) and the
// ENVELOPE each message runs in (6 turns of history -> 2, 800 reply tokens
// -> 600). Preserving only the count would have been the easy half and the
// wrong one: a user notices a shorter reply.
//
// What this file pins is mostly the ways an exception can stop being an
// exception and become a hole. Every check below except the first two is
// about one of those.
//
// Run: node scripts/tests/grandfathering.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

const fc = await loadTs("src/lib/billing/free-chat.ts");
const { combinedCeilingTable } = await loadTs("src/lib/billing/free-allowances.ts");
const { parsePricingConfig } = await loadTs("src/lib/billing/pricing-config.ts");

const {
  freeChatAllowance,
  freeChatAllowanceForAccount,
  freeChatLimitsForAccount,
  legacyExcessCostEur,
  FREE_CHAT_LIMITS,
} = fc;

const CONFIG = parsePricingConfig({}).config;
const ENV = {};
const NOW = new Date("2026-08-15T12:00:00Z");

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

/** The entitlement row the migration writes for a plan. */
function legacyFor(planTier, messages, until = null) {
  return {
    planTier,
    freeChatMessages: messages,
    freeChatHistoryLimit: 6,
    freeChatMaxOutputTokens: 800,
    until,
  };
}

// ---------------------------------------------------------------------------
console.log("== 1. an existing subscriber keeps the COUNT ==");
const OLD_POLICY = { starter: 120, growth: 300, professional: 600, ultimate: 1200, enterprise: 1200 };
for (const [slug, old] of Object.entries(OLD_POLICY)) {
  const published = freeChatAllowance(slug, CONFIG, ENV);
  const granted = freeChatAllowanceForAccount(slug, legacyFor(slug, old), CONFIG, ENV, NOW);
  check(
    `${slug.padEnd(13)} published ${String(published).padStart(4)} -> grandfathered keeps ${old}`,
    granted === old,
    `got ${granted}`
  );
  check(`${slug.padEnd(13)} and that really is MORE than the new published number`, old > published);
}

// ---------------------------------------------------------------------------
console.log("\n== 2. …and the ENVELOPE, which is the half that is easy to forget ==");
const legacyLimits = freeChatLimitsForAccount("professional", legacyFor("professional", 600), NOW);
check("history window preserved at 6 turns", legacyLimits.historyLimit === 6, `got ${legacyLimits.historyLimit}`);
check("reply cap preserved at 800 tokens", legacyLimits.maxOutputTokens === 800, `got ${legacyLimits.maxOutputTokens}`);
check("the question length is unchanged either way", legacyLimits.maxMessageChars === FREE_CHAT_LIMITS.maxMessageChars);
check("web search stays off — it was never part of the free envelope", legacyLimits.webSearch === false);

const freshLimits = freeChatLimitsForAccount("professional", null, NOW);
check("a NEW account gets the new envelope", freshLimits.historyLimit === 2 && freshLimits.maxOutputTokens === 600,
  `${freshLimits.historyLimit}/${freshLimits.maxOutputTokens}`);
check("a new Professional account gets the published 215", freeChatAllowanceForAccount("professional", null, CONFIG, ENV, NOW) === 215);

// ---------------------------------------------------------------------------
console.log("\n== 3. THE BETA HOLE: an entitlement may not outlive its plan ==");
// A beta account carries plan_tier 'ultimate' without ever paying, and
// silently collapses to Free when beta_expires_at passes — no Stripe
// event, so nothing calls clearLegacyEntitlements. Bound to the plan it
// was granted for, the row simply stops applying.
const betaLegacy = legacyFor("ultimate", 1200);
check(
  "an Ultimate entitlement grants nothing once the account reads as free",
  freeChatAllowanceForAccount("free", betaLegacy, CONFIG, ENV, NOW) === freeChatAllowance("free", CONFIG, ENV),
  `got ${freeChatAllowanceForAccount("free", betaLegacy, CONFIG, ENV, NOW)}`
);
check(
  "…and the old envelope does not leak into the free tier either",
  freeChatLimitsForAccount("free", betaLegacy, NOW).maxOutputTokens === 600
);
// The same guard covers a downgrade whose webhook never landed.
check(
  "an Ultimate entitlement grants nothing on Starter (missed downgrade webhook)",
  freeChatAllowanceForAccount("starter", betaLegacy, CONFIG, ENV, NOW) === freeChatAllowance("starter", CONFIG, ENV)
);
check(
  "it still applies on the plan it WAS granted for",
  freeChatAllowanceForAccount("ultimate", betaLegacy, CONFIG, ENV, NOW) === 1200
);

// ---------------------------------------------------------------------------
console.log("\n== 4. expiry, kill switch, and the direction of max() ==");
const expired = legacyFor("professional", 600, new Date("2026-01-01T00:00:00Z"));
check("an expired entitlement grants the published number", freeChatAllowanceForAccount("professional", expired, CONFIG, ENV, NOW) === 215);
const future = legacyFor("professional", 600, new Date("2027-01-01T00:00:00Z"));
check("one that has not expired still applies", freeChatAllowanceForAccount("professional", future, CONFIG, ENV, NOW) === 600);
check(
  "FREE_CHAT_ENABLED=false turns it off for grandfathered accounts too",
  freeChatAllowanceForAccount("professional", legacyFor("professional", 600), CONFIG, { FREE_CHAT_ENABLED: "false" }, NOW) === 0
);
// max(), not "legacy wins": an account frozen at a number that used to be
// generous is a bug the day the published allowance overtakes it.
check(
  "if the published allowance overtakes the legacy one, the LARGER wins",
  freeChatAllowanceForAccount("professional", legacyFor("professional", 10), CONFIG, ENV, NOW) === 215,
  `got ${freeChatAllowanceForAccount("professional", legacyFor("professional", 10), CONFIG, ENV, NOW)}`
);
check(
  "the same for the envelope",
  freeChatLimitsForAccount("professional", { ...legacyFor("professional", 600), freeChatHistoryLimit: 1, freeChatMaxOutputTokens: 100 }, NOW)
    .maxOutputTokens === 600
);

// ---------------------------------------------------------------------------
console.log("\n== 5. the exception is COUNTABLE, not assumed away ==");
console.log("        plan          published   grandfathered   excess/account/month");
for (const [slug, old] of Object.entries(OLD_POLICY)) {
  const excess = legacyExcessCostEur(slug, legacyFor(slug, old), CONFIG, ENV, NOW);
  const published = freeChatAllowance(slug, CONFIG, ENV) * fc.freeChatPerMessageWorstCaseEur(CONFIG, ENV);
  console.log(
    `        ${slug.padEnd(13)} EUR ${published.toFixed(2).padStart(6)}   ` +
      `${String(old).padStart(6)} msgs      EUR ${excess.toFixed(2)}`
  );
  check(`${slug.padEnd(13)} reports a positive, finite excess`, excess > 0 && Number.isFinite(excess));
}
check("an account with no entitlement has zero excess", legacyExcessCostEur("professional", null, CONFIG, ENV, NOW) === 0);
check("an expired one has zero excess", legacyExcessCostEur("professional", expired, CONFIG, ENV, NOW) === 0);
check("a wrong-plan one has zero excess", legacyExcessCostEur("free", betaLegacy, CONFIG, ENV, NOW) === 0);

// ---------------------------------------------------------------------------
console.log("\n== 6. grandfathering does not leak into the PUBLISHED ceiling ==");
// The ceiling is a statement about what the plans grant. If the legacy
// numbers reached it, the gate would report the exception as compliance.
for (const row of combinedCeilingTable(CONFIG, ENV)) {
  if (row.priceEur === null) continue;
  check(
    `${row.planSlug}: still exactly the published worst case (${row.combinedMargin.toFixed(2)}x)`,
    row.combinedMargin >= 4 - 1e-9,
    `${(row.totalShare * 100).toFixed(1)}%`
  );
}

// ---------------------------------------------------------------------------
console.log("\n== 7. the wiring, asserted from source rather than assumed ==");
const creditsSrc = readFileSync("src/lib/billing/credits.ts", "utf8");
check(
  "a plan change clears the entitlement (syncCreditsForPlan)",
  /syncCreditsForPlan[\s\S]{0,900}clearLegacyEntitlements\(userId\)/.test(creditsSrc)
);
const routeSrc = readFileSync("src/app/api/chat/route.ts", "utf8");
check("the chat route loads the account's entitlements", /loadLegacyEntitlements\(user\.id\)/.test(routeSrc));
check("…and applies the per-account envelope to history", /history\.slice\(-freeLimits\.historyLimit\)/.test(routeSrc));
check("…and to the reply cap", /\?\s*freeLimits\.maxOutputTokens/.test(routeSrc));
check("…and to the size gate", /message\.length <= freeLimits\.maxMessageChars/.test(routeSrc));
check(
  "…and passes them to the counter, so the UI and the server agree",
  /consumeFreeChatMessage\(user\.id, plan\?\.slug \?\? "free", legacy\)/.test(routeSrc)
);
const chatPageSrc = readFileSync("src/app/dashboard/chat/page.tsx", "utf8");
check("the page shows the same allowance the route enforces", /getFreeChatStatus\(user\.id, plan\?\.slug \?\? "free", legacy\)/.test(chatPageSrc));

// Was `supabase_grandfathering_migration.sql` at the repository root.
// The consolidation into supabase/migrations was built from a structure
// dump, which carries columns but not statements — so the columns landed
// in the baseline and the UPDATE that fills them did not. It is now
// 20260817000001_grandfathering_backfill.sql, and this test is what would
// have caught that at the time had it been reading the migrations.
const MIGRATION = "supabase/migrations/20260817000001_grandfathering_backfill.sql";
const sql = readFileSync(MIGRATION, "utf8");
check("the migration adds every column the code reads", [
  "legacy_plan_tier",
  "legacy_free_chat_messages",
  "legacy_free_chat_history_limit",
  "legacy_free_chat_max_output_tokens",
  "legacy_entitlements_until",
].every((c) => sql.includes(`add column if not exists ${c}`)));
check("the backfill is idempotent", /legacy_entitlements_backfilled_at is null/.test(sql));
check("the backfill excludes beta grants", /beta_expires_at/.test(sql));
// Comments are stripped first. This file's own header says "No DROP, no
// TRUNCATE, no unqualified DELETE" — a scan that cannot tell prose from
// statements reports the promise as the violation, which is exactly what
// the first run of this check did.
const sqlStatements = sql.replace(/^\s*--.*$/gm, "");
check(
  "the migration destroys nothing",
  !/\bdrop\s+table\b|\btruncate\b|\bdrop\s+constraint\b/i.test(sqlStatements) &&
    !/delete\s+from\s+\w+\s*;/i.test(sqlStatements),
  sqlStatements.match(/\b(drop\s+table|truncate|drop\s+constraint|delete\s+from)\b/i)?.[0] ?? ""
);
// The optional Free-tier block and the two operational queries are
// commented out on purpose; a stray uncomment would change behaviour
// silently, so the shape is pinned.
check(
  "the optional Free-account backfill is not active",
  !/^\s*update public\.user_credits uc\s*$[\s\S]{0,200}legacy_plan_tier\s*=\s*'free'/m.test(sqlStatements)
);
// The columns the code selects must be the columns the migration creates —
// a mismatch fails at runtime as a PostgREST error inside a try/catch that
// degrades to "no entitlements", i.e. silently takes the allowance away.
const legacySrc = readFileSync("src/lib/billing/legacy-entitlements.ts", "utf8");
const selected = legacySrc.match(/\.select\(\s*"([^"]+)"/)?.[1] ?? "";
const selectedColumns = selected.split(",").map((c) => c.trim()).filter(Boolean);
// THE FLOOR. One regex on one call site produced this list, and when it
// stopped matching — a reformatted `.select(` spread over two lines is
// enough — `selected` became "" and the loop below ran ZERO times while
// reporting nothing. Measured: five columns are selected.
check(
  `the select() call was found and names columns (${selectedColumns.length})`,
  selectedColumns.length >= 5,
  "0 here means the per-column checks below run zero times"
);
for (const column of selectedColumns) {
  check(`selected column ${column} exists in the migration`, sql.includes(column));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
