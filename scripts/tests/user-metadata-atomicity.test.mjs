// Seven read-modify-writes on user_metadata, and the one place they can be
// done atomically.
//
// WHAT WENT WRONG. Supabase's admin API replaces user_metadata wholesale —
// there is no partial update — so every route that wanted one key wrote
//
//     const { data } = await admin.auth.admin.getUserById(id);
//     await admin.auth.admin.updateUserById(id, {
//       user_metadata: { ...data.user.user_metadata, one_key: value },
//     });
//
// A read, a gap, a write. Stripe delivers customer.subscription.updated and
// invoice.paid inside the same second and Vercel runs them as two concurrent
// invocations of the same handler, so both read the same snapshot and the
// second write erased the first. Anything ANOTHER route wrote in that window
// went the same way — a team grant accepted mid-webhook (team_granted_tier,
// team_owner_id) disappeared and the member lost the plan their owner pays
// for, silently.
//
// Run: node scripts/tests/user-metadata-atomicity.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
let pass = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}
// Comments are not code (and this file's own subject is quoted at length in
// several of them — the helper's docstring reproduces the exact bad pattern
// so the next reader knows what it replaced).
const stripTs = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|\*).*$/gm, "");

console.log("user-metadata-atomicity");

const tsFiles = walk(path.join(ROOT, "src")).sort();
check(`scanned the app (${tsFiles.length} TypeScript files)`, tsFiles.length >= 300);

// ---------------------------------------------------------------------
console.log("\n== 1. nothing replaces user_metadata any more ==");
// ---------------------------------------------------------------------
// The whole class, not the seven instances: any NEW route that reaches for
// updateUserById gets the same bug, so the API itself is what is banned.
const offenders = [];
for (const file of tsFiles) {
  const code = stripTs(readFileSync(file, "utf8"));
  if (/updateUserById\s*\(/.test(code)) offenders.push(path.relative(ROOT, file));
}
check(
  "no file calls admin.auth.admin.updateUserById",
  offenders.length === 0,
  `still calling it: ${offenders.join(", ")} — use mergeUserMetadata (lib/auth/user-metadata.ts)`
);

// And the spread that made it lossy, in case someone reaches the same shape
// through a different call.
const spreaders = [];
for (const file of tsFiles) {
  const code = stripTs(readFileSync(file, "utf8"));
  if (/user_metadata:\s*\{\s*\.\.\./.test(code)) spreaders.push(path.relative(ROOT, file));
}
check(
  "no file spreads a user_metadata snapshot into a write",
  spreaders.length === 0,
  `spreading: ${spreaders.join(", ")}`
);

// ---------------------------------------------------------------------
console.log("\n== 2. every metadata write goes through the merge ==");
// ---------------------------------------------------------------------
// The seven call sites, named. A floor is not enough here: the point is
// that each of these specific routes was one of the racers.
const CALLERS = [
  "src/app/api/webhooks/stripe/route.ts",
  "src/app/auth/callback/route.ts",
  "src/app/api/checkout/route.ts",
  "src/app/api/credits/checkout/route.ts",
  "src/app/api/billing/addons/route.ts",
  "src/app/api/team/remove/route.ts",
  "src/lib/team/accept-pending-invite.ts",
];
for (const rel of CALLERS) {
  const code = stripTs(readFileSync(path.join(ROOT, rel), "utf8"));
  check(`${rel} uses mergeUserMetadata`, /mergeUserMetadata\s*\(/.test(code));
}

// ---------------------------------------------------------------------
console.log("\n== 3. the RPC argument names match the SQL signature ==");
// ---------------------------------------------------------------------
// RULE: a `.rpc()` argument object is runtime strings. TypeScript cannot see
// that `p_patch` is spelled `p_patch` in the function, and PostgREST answers
// a mismatch with "function does not exist" — at the moment a customer's
// subscription changes, in a webhook nobody is watching.
const helper = readFileSync(path.join(ROOT, "src/lib/auth/user-metadata.ts"), "utf8");
const rpcCall = helper.match(/\.rpc\(\s*"([^"]+)"\s*,\s*\{([^}]*)\}/);
check("the helper calls an RPC", Boolean(rpcCall));
const rpcName = rpcCall?.[1] ?? "";
const rpcArgs = rpcCall ? [...rpcCall[2].matchAll(/(\w+)\s*:/g)].map((m) => m[1]).sort() : [];
check(`it calls ${rpcName || "(none)"}`, rpcName === "merge_user_metadata");

const migrations = readdirSync(path.join(ROOT, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
const defining = migrations.filter((f) =>
  readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8").includes(
    "function public.merge_user_metadata("
  )
);
check(`a migration defines merge_user_metadata (${defining.join(", ") || "none"})`, defining.length >= 1);

if (defining.length > 0) {
  // The LAST migration to define it wins, the same rule enum-schema-drift
  // applies to constraints.
  const sql = readFileSync(path.join(ROOT, "supabase/migrations", defining[defining.length - 1]), "utf8");
  const sigMatch = sql.match(
    /create\s+or\s+replace\s+function\s+public\.merge_user_metadata\s*\(([\s\S]*?)\)\s*returns/i
  );
  check("the CREATE FUNCTION signature is readable", Boolean(sigMatch));
  const sqlParams = sigMatch
    ? [...sigMatch[1].matchAll(/^\s*(p_\w+)/gm)].map((m) => m[1]).sort()
    : [];
  check(
    `SQL parameters ${JSON.stringify(sqlParams)} match the RPC arguments ${JSON.stringify(rpcArgs)}`,
    JSON.stringify(sqlParams) === JSON.stringify(rpcArgs),
    "a name that differs is a 404 from PostgREST at the moment a subscription changes"
  );
  check(`there are three of them (${sqlParams.length})`, sqlParams.length === 3);

  // ---------------------------------------------------------------------
  console.log("\n== 4. the function is not reachable by a signed-in user ==");
  // ---------------------------------------------------------------------
  // It rewrites entitlements. PostgreSQL grants EXECUTE to PUBLIC by default,
  // so the revoke is the whole of its security.
  const sqlCode = sql
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
  for (const role of ["public", "anon", "authenticated"]) {
    check(
      `execute is revoked from ${role}`,
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.merge_user_metadata\\s*\\([^)]*\\)\\s+from\\s+${role}\\b`, "i").test(sqlCode)
    );
  }
  check(
    "and granted to service_role",
    /grant\s+execute\s+on\s+function\s+public\.merge_user_metadata\s*\([^)]*\)\s+to\s+service_role\b/i.test(sqlCode)
  );
  check("it is SECURITY DEFINER", /security\s+definer/i.test(sqlCode));
  check(
    "with search_path pinned, so it cannot be redirected by a caller's path",
    /set\s+search_path\s*=/i.test(sqlCode)
  );
  check(
    "the migration self-checks the grants rather than trusting the revoke",
    /has_function_privilege\(\s*'anon'/.test(sqlCode)
  );

  // ---------------------------------------------------------------------
  console.log("\n== 5. it is a merge, and removal happens first ==");
  // ---------------------------------------------------------------------
  // Two halves of one claim: the patch arrives through the jsonb merge
  // operator, and the column is never simply set TO the patch — which would
  // be the whole bug reimplemented in SQL.
  check("the patch is applied with the || merge operator", /\|\|\s*p_patch/.test(sqlCode));
  check(
    "and raw_user_meta_data is never assigned the patch outright",
    !/raw_user_meta_data\s*=\s*p_patch\b/.test(sqlCode)
  );
  check(
    "the merge reads the column it writes, in the same statement",
    /set\s+raw_user_meta_data\s*=[\s\S]{0,200}?raw_user_meta_data/.test(sqlCode)
  );
  check("it removes keys with -", /-\s*coalesce\(p_remove/.test(sqlCode));
  // /api/team/remove drops team_granted_tier and may set subscription_tier in
  // the same call; the other order would delete what it just wrote.
  const removeIdx = sqlCode.search(/-\s*coalesce\(p_remove/);
  const mergeIdx = sqlCode.search(/\|\|\s*p_patch/);
  check("removal is applied before the patch", removeIdx !== -1 && mergeIdx !== -1 && removeIdx < mergeIdx);
  check("a missing user is an error, not a silent no-op", /if\s+not\s+found\s+then/i.test(sqlCode));
}

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ${failures.join("\n  - ")}`
);
process.exit(failures.length === 0 ? 0 : 1);
