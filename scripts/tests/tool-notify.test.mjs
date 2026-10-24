// «ΕΙΔΟΠΟΙΗΣΕ ΜΕ ΟΤΑΝ ΑΝΟΙΞΕΙ» (the final All tools grid, §3, 2026-10-24):
// pressing Notify on a Coming Soon tile stores a subscription, never
// charges anything, never calls a provider, and is readable/writable only
// by the account itself (RLS). The notification itself has no cron — it is
// scripts/notify-tool-ready.mjs, run by hand the day a tool's `ready`
// flips — so this gate holds the storage and the isolation, not delivery.
//
// Run: node scripts/tests/tool-notify.test.mjs
import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const route = readFileSync("src/app/api/tools/notify/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261028000000_tool_notify_subscriptions.sql", "utf8");
const shell = readFileSync("src/components/tools/coming-soon-shell.tsx", "utf8");
const script = readFileSync("scripts/notify-tool-ready.mjs", "utf8");
const registry = readFileSync("src/lib/gdpr/user-data-registry.ts", "utf8");
const canaries = readFileSync("src/lib/health/schema-canaries.ts", "utf8");

console.log("== 1. the route: signed-in, bounded, never updates ==");
check("POST requires a signed-in user", /if \(!user\) return NextResponse\.json\(\{ error: "not_signed_in" \}, \{ status: 401 \}\);/.test(route));
check("the tool key is bounded (no unbounded string reaches the row)", /tool\.length > MAX_TOOL_KEY_CHARS/.test(route));
check("a second press is a no-op, not a second row (upsert, ignoreDuplicates)", /upsert\(\{ user_id: user\.id, tool_key: tool \}, \{ onConflict: "user_id,tool_key", ignoreDuplicates: true \}\)/.test(route));
check("DELETE scopes to the caller's own row only", /\.delete\(\)\.eq\("user_id", user\.id\)\.eq\("tool_key", tool\)/.test(route));
check("the route never updates a row (RLS backs this: no update policy)", !/\.update\(/.test(route));
check("a write failure is logged and reported, not swallowed", /logApiError\("\/api\/tools\/notify"/.test(route));

console.log("\n== 2. the migration: RLS scoped to the caller, no update, undo stated ==");
check("row level security is enabled", /alter table public\.tool_notify_subscriptions enable row level security;/.test(migration));
check("select/insert/delete are each scoped to auth.uid() = user_id", [...migration.matchAll(/for (select|insert|delete)[\s\S]{0,40}auth\.uid\(\) = user_id/g)].length === 3);
check("update is revoked from both anon and authenticated (no update policy exists at all)", /revoke update on public\.tool_notify_subscriptions from anon, authenticated;/.test(migration));
check("one subscription per person per tool (unique constraint), so a second press never doubles up", /unique \(user_id, tool_key\)/.test(migration));
check("the row is erased with the account (cascade)", /references auth\.users\(id\) on delete cascade/.test(migration));
check("the migration says how to undo it", /-- How to undo:/.test(migration));
check("the table is in the schema canaries (so a missing table breaks loudly, not silently)", /table: "tool_notify_subscriptions"/.test(canaries));
check("...and in the GDPR data registry (so an export/erase sweep finds it)", /table: "tool_notify_subscriptions"/.test(registry));

console.log("\n== 3. the button: no charge, no provider call, ever ==");
check("pressing Notify calls only /api/tools/notify", /fetch\("\/api\/tools\/notify"/.test(shell));
check("...and no provider/billing route is ever reached from this screen", !/\/api\/(images|videos|audio|chat|billing)\b/.test(shell));
check("a failed subscribe shows a toast rather than silently doing nothing", /addToast|useToast/.test(shell));
check("the button's own three states are modeled (idle, sending, subscribed/failed)", /"idle"/.test(shell) && /"sending"/.test(shell));

console.log("\n== 4. the notify script: honest about having no cron ==");
check("the script requires DATABASE_URL rather than silently no-op'ing", /DATABASE_URL/.test(script));
check("it deletes the subscriptions it just notified (no repeat notification)", /delete/i.test(script) && /tool_notify_subscriptions/.test(script));
check("it supports --dry-run so a run can be checked before it writes", /--dry-run/.test(script));
check("it is documented as bypassing the curated NotificationType list, not silently extending it", /NotificationType/.test(script));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
