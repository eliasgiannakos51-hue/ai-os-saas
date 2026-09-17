// AUTHENTICATED IS NOT THE SAME AS YOURS.
//
// THE MIDDLE SHAPE. security-posture.test.mjs asks whether a route knows
// WHO is calling, and every endpoint in this app passes it. Nothing asked
// the next question: having resolved the caller, does the route check
// that the thing it is about to read, change, delete or publish belongs
// to them? A route with auth.getUser() and `.eq("id", params.id)` and
// nothing else reads correct, passes every existing gate, and serves
// somebody else's row.
//
// It is not "the check is missing" and it is not "the check is wrong".
// It is a check that answers a different question than the one that
// matters, which is why no gate written for either end catches it.
//
// WHAT THE TREE ACTUALLY DOES, measured 2026-09-17: 66 authenticated
// routes act on an identifier the REQUEST supplied. Sixteen build an
// admin client, which bypasses RLS entirely. The other fifty do not
// filter by user_id in TypeScript at all — they read through the caller's
// own Supabase client and let the policy scope it. That is the right
// design, and rls-coverage.test.mjs is what holds up the other half:
// 205 policies, 204 scoped to auth.uid(), the exception being published
// help articles.
//
// SO THE RULE IS ABOUT THE SIXTEEN. A route that reaches past RLS has to
// establish ownership itself, and this tree does it in four ways — which
// is why this is a list of named mechanisms rather than a clever rule.
// A rule that knew only `.eq("user_id", ...)` called
// /api/jobs/[id]/continue unowned; it compares `user.id !== job.user_id`
// twenty lines further down.
//
// Run: node scripts/tests/resource-ownership.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let pass = 0,
  fail = 0;
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const routes = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry === "route.ts") routes.push(full.replace(/\\/g, "/"));
  }
})("src/app");

// Comments stripped, because this file's own header spells several of the
// mechanisms below and a route whose COMMENT mentions user_id is the case
// the exercise exists to stop counting as safe.
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SOURCE = new Map(routes.map((f) => [f, strip(readFileSync(f, "utf8"))]));
check(`routes found (${routes.length})`, routes.length >= 100, "the walk found almost nothing");

const AUTHENTICATES = /auth\s*\.\s*getUser\s*\(|getCurrentUser(?:Result)?\s*\(/;
const CRON = /checkCronAuth\s*\(/;
const ADMIN_CLIENT = /createAdminClient\s*\(/;
// An identifier that came from OUTSIDE: the path, the body, the query.
const FROM_REQUEST = /params\.[a-zA-Z_]+|body\??\.[a-zA-Z_]*[Ii]d\b|searchParams\.get\(/;

const authed = routes.filter((f) => AUTHENTICATES.test(SOURCE.get(f)) && !CRON.test(SOURCE.get(f)));
const onRequestId = authed.filter((f) => FROM_REQUEST.test(SOURCE.get(f)));
const reachesPastRls = onRequestId.filter((f) => ADMIN_CLIENT.test(SOURCE.get(f)));

check(`authenticated routes (${authed.length})`, authed.length >= 60, "the auth detector matched almost nothing");
check(`...acting on an identifier from the request (${onRequestId.length})`, onRequestId.length >= 40, "the request-id detector matched almost nothing and every check below is vacuous");
check(`...of those, reaching past RLS with the admin client (${reachesPastRls.length})`, reachesPastRls.length >= 8, "the admin-client detector matched almost nothing, so the rule below applies to nobody");

// ---------------------------------------------------------------------
// THE FOUR MECHANISMS. Each is a thing this tree does, not a shape a
// linter would guess.
// ---------------------------------------------------------------------
const OWNERSHIP = {
  // The row is read through the CALLER's client first, so RLS proved it
  // is theirs before the admin client touches it by id.
  read_under_rls: (src) => /createClient\s*\(\s*\)/.test(src) && /\.from\(/.test(src),
  // An explicit filter on the owning column.
  explicit_filter: (src) => /\.eq\(\s*"(user_id|owner_id|owner|created_by|shared_by)"/.test(src),
  // An explicit comparison in TypeScript.
  explicit_compare: (src) =>
    /user\.id\s*!==?\s*[a-zA-Z_$][\w$]*\.(user_id|owner_id)/.test(src) ||
    /[a-zA-Z_$][\w$]*\.(user_id|owner_id)\s*!==?\s*user\.id/.test(src),
  // A named helper that answers the question for a resource this app has
  // more than one way of owning.
  helper: (src) => /resolveDeliveryOwnership|referenceImagePathBelongsToUser|isProjectMemberTable/.test(src),
  // The route is owner-only, so the resource being somebody else's is the
  // point of it.
  owner_only: (src) => /isAdminEmail\s*\(/.test(src),
};
const ownershipOf = (f) =>
  Object.entries(OWNERSHIP)
    .filter(([, test]) => test(SOURCE.get(f)))
    .map(([k]) => k);

for (const kind of Object.keys(OWNERSHIP)) {
  check(
    `at least one route establishes ownership by '${kind}'`,
    onRequestId.some((f) => ownershipOf(f).includes(kind)),
    `nothing matched the '${kind}' test — a renamed helper turns this mechanism off silently and every route using it reads as unowned`
  );
}

// ---------------------------------------------------------------------
// THE RULE.
// ---------------------------------------------------------------------
const NO_OWNERSHIP_NEEDED = {};
const unowned = reachesPastRls
  .filter((f) => ownershipOf(f).length === 0 && !NO_OWNERSHIP_NEEDED[f])
  .map((f) => f.replace("src/app/api/", "").replace("/route.ts", ""));
check(
  "every route that reaches past RLS establishes ownership first",
  unowned.length === 0,
  unowned.length
    ? `authenticated, acting on a request-supplied id, admin client, and none of the four mechanisms:\n        ${unowned.join("\n        ")}\n        ` +
      "Read the row through the caller's own client first, filter on the owning column, compare the ids, or declare it in NO_OWNERSHIP_NEEDED with the argument."
    : ""
);
const staleExemptions = Object.keys(NO_OWNERSHIP_NEEDED).filter((f) => !reachesPastRls.includes(f));
check("no ownership exemption has gone stale", staleExemptions.length === 0, staleExemptions.join(", "));

// ---------------------------------------------------------------------
// AND THE FIFTY THAT DELEGATE, which is the larger half and the one that
// looks like nothing. Their ownership check is a policy in the database,
// so the link between the two files is stated here rather than assumed.
// ---------------------------------------------------------------------
const delegating = onRequestId.filter((f) => !ADMIN_CLIENT.test(SOURCE.get(f)));
check(
  `routes whose whole ownership check is RLS (${delegating.length})`,
  delegating.length >= 30,
  "if this has collapsed, either the tree changed or the admin-client detector is over-matching"
);
const RLS_GATE = "scripts/tests/rls-coverage.test.mjs";
const rlsGate = readFileSync(RLS_GATE, "utf8");
check(
  "...and the gate that holds up that half asserts policies scope to auth.uid()",
  /every policy scopes its rows to auth\.uid\(\)/.test(rlsGate),
  `${RLS_GATE} no longer checks the thing these ${delegating.length} routes rely on, and nothing here would notice`
);
check(
  "...including that an insert cannot write somebody else's row",
  /every insert policy binds the row to the caller/.test(rlsGate),
  "a with-check clause is not a using clause, and only one of them stops insert with a borrowed user_id"
);

// ---------------------------------------------------------------------
// CONTROLS, driving ownershipOf on text of their own.
// ---------------------------------------------------------------------
const CONTINUE = "src/app/api/jobs/[id]/continue/route.ts";
check(
  "control: an id comparison counts as ownership",
  ownershipOf(CONTINUE).includes("explicit_compare"),
  "jobs/[id]/continue reads the job with the ADMIN client and then compares user.id to job.user_id; a rule that knew only .eq() called it unowned"
);
const PUBLISH = "src/app/api/websites/[id]/publish/route.ts";
check(
  "control: publishing is seen to act on a request id",
  onRequestId.includes(PUBLISH),
  "the route that puts a site on the public internet is not in the population"
);
check(
  "control: ...and to establish ownership",
  ownershipOf(PUBLISH).length > 0,
  "publishing reads through the caller's own client, so RLS decides whose site this is"
);
check(
  "control: an ownership claim in a comment does not count",
  Object.values(OWNERSHIP).every((t) => !t(strip('// reads it with .eq("user_id", user.id) under createClient()\nconst x = 1;'))),
  "the comment stripper is not running, so a note about a check counts as the check"
);
check(
  "control: an .eq on the resource id alone is not ownership",
  Object.values(OWNERSHIP).every((t) => !t('const admin = createAdminClient();\nawait admin.from("t").select("*").eq("id", params.id);')),
  "this is the exact shape the file exists for: authenticated, scoped to the row asked for, and not to the asker"
);

console.log(`\n        ${authed.length} authenticated · ${onRequestId.length} act on a request id · ${reachesPastRls.length} reach past RLS · ${delegating.length} delegate to it`);
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
