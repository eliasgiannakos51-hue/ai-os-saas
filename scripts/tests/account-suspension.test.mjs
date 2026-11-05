// A SUSPENSION THAT HOLDS EVERYWHERE THE ACCOUNT CAN ACT (2026-11-05 review, A1).
//
// It used to be one key in user_metadata — which the account can rewrite
// itself — and only the dashboard layout read it. What must hold now:
//
//   1. the rule (lib/auth/suspension.ts) reads app_metadata, the older
//      user_metadata key and a ban in force, and nothing else decides it
//   2. api/admin/suspend BANS the account and writes app_metadata, never
//      user_metadata, and lifting does the reverse; both are audited
//   3. the middleware refuses every /api/* call and every dashboard page
//      of a suspended session, before the route runs
//   4. every cron in vercel.json either excludes suspended accounts from
//      the work it picks, or is listed below with the reason it has none
//   5. the database keeps the older keys for the server and answers the
//      crons' list (migration 20261115000000_account_suspension.sql;
//      the behaviour itself is account-suspension.dbtest.mjs)
//
// Run: node scripts/tests/account-suspension.test.mjs
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (f) => strip(readFileSync(f, "utf8"));

console.log("== 1. the rule ==");
const rule = await loadTs("src/lib/auth/suspension.ts");
const { isSuspended, suspensionReason, SUSPENSION_KEYS, SUSPEND_BAN_DURATION, LIFT_BAN_DURATION } = rule;
const NOW = Date.parse("2026-11-05T12:00:00Z");
check("app_metadata.suspended suspends", isSuspended({ app_metadata: { suspended: true }, user_metadata: {} }, NOW) === true);
check("the older user_metadata.suspended still suspends", isSuspended({ app_metadata: {}, user_metadata: { suspended: true } }, NOW) === true);
check("a ban in force suspends", isSuspended({ app_metadata: {}, user_metadata: {}, banned_until: "2126-01-01T00:00:00Z" }, NOW) === true);
check("a ban that ran out does not", isSuspended({ app_metadata: {}, user_metadata: {}, banned_until: "2026-01-01T00:00:00Z" }, NOW) === false);
check("nothing set is not suspended", isSuspended({ app_metadata: {}, user_metadata: {} }, NOW) === false);
check("a truthy string is not a flag", isSuspended({ app_metadata: { suspended: "true" }, user_metadata: {} }, NOW) === false);
check("no user is not suspended", isSuspended(null, NOW) === false);
check("the reason is read from app_metadata first", suspensionReason({ app_metadata: { suspended_reason: "a" }, user_metadata: { suspended_reason: "u" } }) === "a");
check("a suspension is a ban until lifted", SUSPEND_BAN_DURATION === "876000h" && LIFT_BAN_DURATION === "none");
check("the four keys", JSON.stringify([...SUSPENSION_KEYS]) === JSON.stringify(["suspended", "suspended_reason", "suspended_at", "suspended_by"]));

// The population is the tree: nothing outside the rule reads the flag.
const readers = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const f = `${dir}/${e}`;
    if (statSync(f).isDirectory()) walk(f);
    else if (/\.(ts|tsx)$/.test(e) && f !== "src/lib/auth/suspension.ts" && /(user|app)_metadata\??\.suspended\b|meta\.suspended\b/.test(read(f))) readers.push(f);
  }
})("src");
check("no file but the rule reads a suspension flag itself", readers.length === 0, readers.join(", "));
for (const [f, re] of [
  ["src/app/dashboard/layout.tsx", /if \(isSuspended\(user\)\) \{\s*redirect\("\/suspended"\);/],
  ["src/app/suspended/page.tsx", /if \(!isSuspended\(user\)\)/],
  ["src/app/api/admin/users/route.ts", /suspended: isSuspended\(u\),/],
]) {
  check(`${f} asks the rule`, re.test(read(f)));
}

console.log("\n== 2. the admin route bans, and lifts the ban ==");
const route = read("src/app/api/admin/suspend/route.ts");
const suspendArm = route.slice(route.indexOf('if (action === "suspend")'), route.indexOf("} else {", route.indexOf('if (action === "suspend")')));
const liftArm = route.slice(route.indexOf("} else {", route.indexOf('if (action === "suspend")')));
check(
  "suspending bans the account and writes app_metadata, in one call",
  /admin\.auth\.admin\.updateUserById\(userId, \{\s*ban_duration: SUSPEND_BAN_DURATION,\s*app_metadata: \{\s*suspended: true,/.test(suspendArm)
);
check("...and stops if Supabase refuses", /if \(banError\) throw banError;/.test(suspendArm));
check("...writes nothing into user_metadata", !/mergeUserMetadata|user_metadata/.test(suspendArm));
check("...and is audited", /logAdminAction\(user\.email!, "suspend_user"/.test(suspendArm));
check(
  "lifting removes the ban and every app_metadata key",
  /ban_duration: LIFT_BAN_DURATION,\s*app_metadata: Object\.fromEntries\(SUSPENSION_KEYS\.map\(\(k\) => \[k, null\]\)\),/.test(liftArm) && /if \(liftError\) throw liftError;/.test(liftArm)
);
check("...and the older user_metadata keys, through the merge", /mergeUserMetadata\(userId, \{\}, \{ remove: \[\.\.\.SUSPENSION_KEYS\]/.test(liftArm));
check("...and is audited", /"unsuspend_user"/.test(liftArm));
check("an admin cannot be suspended", /if \(isAdminEmail\(targetUser\.user\.email\)\)/.test(route));

console.log("\n== 3. the middleware refuses a suspended session ==");
const mw = read("src/proxy.ts");
const block = /if \(user && isSuspended\(user\)\) \{([\s\S]*?)\n  \}\n/.exec(mw)?.[1] ?? "";
check("the middleware asks the rule, on the user it already fetched", block.length > 0);
check("...refuses every API call by code", /path\.startsWith\("\/api\/"\)[\s\S]{0,120}code: "account_suspended" \}, \{ status: 403 \}/.test(block));
check("...and sends pages to /suspended", /url\.pathname = "\/suspended"/.test(block) && /isDashboardRoute \|\| path\.startsWith\("\/onboarding"\)/.test(block));
check(
  "...before any route-specific answer",
  mw.indexOf("if (user && isSuspended(user))") > mw.indexOf("await supabase.auth.getUser()") &&
    mw.indexOf("if (user && isSuspended(user))") < mw.indexOf("if (user && !user.email_confirmed_at)")
);
const matcher = /matcher:\s*\[[\s\S]*?"(\/\(\(\?![^"]+)"/.exec(readFileSync("src/proxy.ts", "utf8"))?.[1] ?? "";
check("...and the middleware runs on /api", matcher.length > 0 && !/\bapi\b/.test(matcher), matcher);

console.log("\n== 4. every cron skips a suspended account's work, or says why it has none ==");
// The population is vercel.json: every scheduled path.
const crons = JSON.parse(readFileSync("vercel.json", "utf8")).crons.map((c) => c.path);
check(`the crons were read (${crons.length})`, crons.length >= 10);
const fileOf = (p) => `src/app${p}/route.ts`;
// Where the work is picked, when that is not the route itself.
const PICKED_IN = { "/api/cron/agent-batches": "src/lib/ai/batch/agent-batch.ts" };
// How many picks of due work each file makes — each one excluded.
const PICKS = { "/api/cron/scheduled-runs": 2, "/api/cron/automation-flows": 2 };
const NO_ACCOUNT_WORK = {
  "/api/cron/affiliate-payouts":
    "pays affiliates what they are owed. What holds a payout is the affiliate's own status (affiliates.status = 'suspended', refused first by payoutDecision in lib/affiliate/rules.ts), which the owner sets on its own; it runs no account's work.",
  "/api/cron/cost-alerts": "emails the OWNER about spend across the product; it does nothing in any account's name.",
  "/api/cron/execute-deletions":
    "carries out deletions the account holder asked for and confirmed by email. A suspended account's request must still be honoured, so it is not skipped.",
  "/api/cron/monthly-credits": "resets credit allowances, which is bookkeeping: a suspended account cannot spend them, because sign-in, the API and every cron below refuse it.",
  "/api/cron/reset-credits": "the same bookkeeping as monthly-credits, on the first of the month.",
  "/api/cron/nav-retention": "deletes old navigation rows; it runs nothing for anybody.",
  "/api/cron/website-storage-cleanup": "removes stored images no row points at any more; it runs nothing for anybody.",
};
for (const p of crons) {
  const file = PICKED_IN[p] ?? fileOf(p);
  if (!existsSync(file)) {
    check(`${p} has a route`, false, file);
    continue;
  }
  const src = read(file);
  const excused = Object.prototype.hasOwnProperty.call(NO_ACCOUNT_WORK, p);
  const excludes = (src.match(/\.not\("user_id", "in", suspendedIn\(suspended\)\)/g) ?? []).length;
  const reads = /const suspended = await suspendedUserIds\(admin, "[^"]+"\);/.test(src);
  const perUser = /isSuspended\(user\)/.test(src);
  if (excused) {
    check(`${p}: has no account's work — ${NO_ACCOUNT_WORK[p].slice(0, 60)}…`, NO_ACCOUNT_WORK[p].length > 40);
    check(`  …and really skips nothing, so the excuse is not covering a check`, excludes === 0 && !reads && !perUser);
  } else {
    check(
      `${p} excludes suspended accounts from the work it picks (${excludes || (perUser ? "per user" : 0)})`,
      (reads && excludes >= (PICKS[p] ?? 1)) || perUser,
      file
    );
  }
  if (PICKED_IN[p]) check(`  …and the route hands the work to ${PICKED_IN[p]}`, /collectAgentBatches\(/.test(read(fileOf(p))));
}
for (const p of Object.keys(NO_ACCOUNT_WORK)) check(`${p} is still scheduled`, crons.includes(p), "drop its excuse");
const lib = await loadTs("src/lib/auth/suspended-accounts.ts");
check("an empty set excludes nobody", lib.suspendedIn(new Set()) === "(00000000-0000-0000-0000-000000000000)");
check("a set excludes exactly its ids", lib.suspendedIn(new Set(["a", "b"])) === "(a,b)");
const libSrc = read("src/lib/auth/suspended-accounts.ts");
check("the list comes from the database function", /admin\.rpc\("suspended_user_ids"\)/.test(libSrc));
check("...and a failed read is logged, not thrown", (libSrc.match(/logApiError\(context, /g) ?? []).length === 2);

console.log("\n== 5. the database ==");
const MIG = "supabase/migrations/20261115000000_account_suspension.sql";
const mig = readFileSync(MIG, "utf8").replace(/--[^\n]*/g, "");
// THE LATEST DEFINITION of the guard, across every migration, is the one a
// database built in order ends up with.
let latestGuard = "";
for (const f of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
  const sql = readFileSync(`supabase/migrations/${f}`, "utf8").replace(/--[^\n]*/g, "");
  const at = sql.indexOf("create or replace function public.guard_entitlement_metadata()");
  if (at >= 0) latestGuard = sql.slice(at, sql.indexOf("$$;", at));
}
const kept = new Set([...(/protected constant text\[\] := array\[([\s\S]*?)\];/.exec(latestGuard)?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
check(`the guard's latest list was read (${kept.size})`, kept.size >= 8);
for (const k of SUSPENSION_KEYS) check(`${k} is kept for the server`, kept.has(k));
const fn = /create or replace function public\.suspended_user_ids\(\)[\s\S]*?\$\$;/.exec(mig)?.[0] ?? "";
check("suspended_user_ids is defined", fn.length > 0);
check("...security definer, with a fixed search_path", /security definer/.test(fn) && /set search_path = pg_catalog, pg_temp/.test(fn));
check(
  "...reading the flag, the older flag and the ban",
  /raw_app_meta_data ->> 'suspended' = 'true'/.test(fn) && /raw_user_meta_data ->> 'suspended' = 'true'/.test(fn) && /banned_until > now\(\)/.test(fn)
);
check(
  "...and callable by the service role alone",
  /grant execute on function public\.suspended_user_ids\(\) to service_role;/.test(mig) &&
    ["public", "anon", "authenticated"].every((r) => new RegExp(`revoke all on function public\\.suspended_user_ids\\(\\) from ${r};`).test(mig))
);

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
