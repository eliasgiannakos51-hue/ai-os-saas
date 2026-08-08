#!/usr/bin/env node
// V3 Task 14 — the DATA for any sidebar consolidation decision.
//
// The spec's rule, kept literally: real usage numbers FIRST, a proposal
// second, and NOTHING gets removed. This script produces the numbers —
// AI actions per feature (ai_cost_log) and entries per module — so the
// decision about what moves behind a "More" group is made from evidence
// by the owner, not from a developer's guess about which features
// matter. Until this has run against production traffic, no
// consolidation is applied: reorganising a sidebar from imagined usage
// is how the wrong feature gets buried.
//
// Run against the real project (never committed anywhere):
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/usage-report.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

const MODULE_TABLES = [
  "ideas", "competitors", "research", "finance_entries", "learning_entries",
  "trades", "decisions", "products", "content", "leads", "feedback",
  "metrics", "automations",
];

console.log("=== Ionexa usage report ===\n");

console.log("-- AI actions per feature (ai_cost_log, all time) --");
const { data: costRows, error: costError } = await admin
  .from("ai_cost_log")
  .select("feature")
  .limit(50000);
if (costError) {
  console.error("ai_cost_log read failed:", costError.message);
} else {
  const byFeature = new Map();
  for (const row of costRows ?? []) {
    byFeature.set(row.feature, (byFeature.get(row.feature) ?? 0) + 1);
  }
  const sorted = [...byFeature.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) console.log("  (no AI actions recorded yet)");
  for (const [feature, count] of sorted) {
    console.log(`  ${String(count).padStart(6)}  ${feature}`);
  }
}

console.log("\n-- Entries per module (all time) --");
for (const table of MODULE_TABLES) {
  const { count, error } = await admin.from(table).select("id", { count: "exact", head: true });
  console.log(`  ${String(error ? "ERR" : count ?? 0).padStart(6)}  ${table}`);
}

console.log(
  "\nDecision rule: a feature is a 'More'-group candidate only when this\n" +
    "report — over a meaningful window of real traffic — shows it far\n" +
    "below the median, AND moving it removes nothing (same URL, same\n" +
    "capability, one extra click). Nothing is ever removed."
);
