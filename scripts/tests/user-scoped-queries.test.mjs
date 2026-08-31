// A userId THAT IS ONLY EVER LOGGED IS NOT A SCOPE.
//
// Found in V4.6 #1, in three files at once. lib/chat/mentor-context.ts,
// product-mentor-context.ts and trading-mentor-context.ts each took a
// `userId: string`, ran a `.select("*")` over a user table, and used the
// parameter for NOTHING but an error log. The rows they returned went
// straight into a model prompt.
//
// They were safe — api/chat passes the session client, so RLS scoped
// them. That is a property of the CALLERS, not of the queries, and
// lib/user-context.ts already carries the story of what happens when it
// stops being true: it relied on RLS the same way until two job handlers
// began passing the SERVICE-ROLE client, for which RLS does not apply at
// all, and every row of every user was in scope.
//
// THE RULE. A function that takes a userId and queries Supabase must USE
// it — as a filter on a read, or as the owner column on a write. Anything
// else is on the allowlist below, by name, with a reason.
//
// WHY AN ALLOWLIST AND NOT A CLEVERER SCAN. Some queries are keyed by an
// id that was itself obtained through an authorised read — a capability,
// not a guess. That is genuinely safe and genuinely indistinguishable
// from the unsafe version by reading one function. So it is written down
// instead, which makes it reviewable and makes a NEW one fail.
//
// Run: node scripts/tests/user-scoped-queries.test.mjs
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "../check-mutation-markers.mjs";

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

// file :: function -> why it is allowed to query without using its userId.
// EVERY ENTRY IS A CLAIM SOMEBODY CAN CHECK. "It is fine" is not a reason.
const ALLOWED = new Map([
  [
    "src/app/dashboard/costs/page.tsx::CostsPage",
    "An admin-only page reading cost_alert_log GLOBALLY through the admin " +
      "client. There is no per-user scope to apply — the whole point of the " +
      "page is every user's costs. The userId in scope belongs to the " +
      "admin viewing it.",
  ],
  [
    "src/lib/agents/execute-agent.ts::pauseAgentForNoCredits",
    "Updates user_agents by .eq(\"id\", agent.id), where `agent` is the row " +
      "this function was handed after an authorised load. The id is a " +
      "capability, not user input.",
  ],
  [
    "src/lib/ai/batch/agent-batch.ts::settleBatchedRun",
    "Keyed by row.agent_id, read from the batch record the worker owns. " +
      "Never reaches this function from a request body.",
  ],
  [
    "src/lib/integrations/store.ts::recordSync",
    "The insert stamps user_id. The follow-up update is keyed by " +
      "token.integrationId, which came from a token loaded for this user.",
  ],
  [
    "src/lib/jobs/run-job.ts::failJob",
    "Keyed by the jobId the worker is currently executing, claimed under a " +
      "row lock before this runs.",
  ],
  [
    "src/lib/jobs/run-job.ts::reapJob",
    "Same: the reaper selects the rows first and then fails them by id.",
  ],
  [
    "src/lib/team/accept-pending-invite.ts::acceptPendingTeamInvite",
    "The one case where scoping by userId would be the BUG. It finds the " +
      "invite by member_email — an invite has no owner yet, that is what " +
      "makes it pending — and then stamps member_user_id with the userId " +
      "it was given. The parameter is the owner being ASSIGNED, not the " +
      "scope being applied.",
  ],
  [
    "src/lib/research/run-research.ts::failChunk",
    "Keyed by the reportId this run already loaded and authorised.",
  ],
]);

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p)) files.push(p);
  }
})("src");
check(`the scan found source files (${files.length})`, files.length >= 300, String(files.length));

// COMMENTS ARE NOT CODE. A file explaining that it must filter on user_id
// would otherwise read as if it does.
const FN = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(|(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
const TAKES_USER_ID = /\b(userId|ownerId)\s*:\s*string/;
const QUERIES = /\.from\(/;
// USES IT: as a read filter, as a match, or as the owner column of a write.
const USES_IT =
  /\.eq\(\s*["'](user_id|owner_id)["']\s*,\s*(params\.)?(userId|ownerId|user\.id)/;
const STAMPS_IT = /\buser_id:\s*(params\.)?(userId|ownerId|user\.id)/;

const offenders = [];
let scanned = 0;
for (const file of files) {
  const src = stripComments(readFileSync(file, "utf8"));
  if (!QUERIES.test(src)) continue;
  const marks = [...src.matchAll(FN)].map((m) => ({ name: m[1] || m[2], at: m.index }));
  for (let i = 0; i < marks.length; i++) {
    const body = src.slice(marks[i].at, marks[i + 1]?.at ?? src.length);
    if (!QUERIES.test(body) || !TAKES_USER_ID.test(body)) continue;
    scanned++;
    if (USES_IT.test(body) || STAMPS_IT.test(body)) continue;
    const key = `${file}::${marks[i].name}`;
    if (ALLOWED.has(key)) continue;
    offenders.push(key);
  }
}
// A FLOOR ON THE SCAN. "No offenders" is trivially true of a scan that
// walked no functions — which is exactly what a broken regex produces.
check(`functions taking a userId and querying Supabase (${scanned})`, scanned >= 20, String(scanned));
check(
  "every one of them uses it as a filter or an owner column",
  offenders.length === 0,
  offenders.join("\n        ") + "\n        Add .eq(\"user_id\", userId), or allowlist it in this file WITH A REASON."
);

console.log("\n== the allowlist is real, and stays honest ==");
// AN ENTRY FOR A FUNCTION THAT NO LONGER EXISTS is a licence nobody is
// using, and it hides the moment its reasoning stopped applying.
const stale = [...ALLOWED.keys()].filter((key) => {
  const [file, fn] = key.split("::");
  try {
    return !new RegExp(`\\b${fn}\\b`).test(readFileSync(file, "utf8"));
  } catch {
    return true;
  }
});
check("no allowlist entry names a function that is gone", stale.length === 0, stale.join(", "));
check(
  "every allowlist entry gives a reason, not an assurance",
  [...ALLOWED.values()].every((why) => why.length > 60),
  [...ALLOWED.entries()].filter(([, w]) => w.length <= 60).map(([k]) => k).join(", ")
);

console.log("\n== the OTHER shape: functions scoped by the CALLER'S client ==");
// THE GAP THIS SECTION CLOSES, and it is the same bug the header
// describes rather than a new one.
//
// Everything above is about a function that TAKES a userId and must use
// it. There is a second shape: a function that takes a SUPABASE CLIENT
// and no userId, queries a user-owned table with no user_id filter, and
// is correct only because the caller's client carries RLS. lib/user-
// context.ts's own header records what happens when that stops being
// true — "two job handlers began passing the SERVICE-ROLE client, for
// which RLS does not apply at all, and every row of every user was in
// scope."
//
// That was fixed for user-context.ts. It was not fixed as a CLASS: nine
// query sites across seven functions still have this shape, and two of
// them are called with the admin client today. Both are safe, for a
// reason that was written nowhere and checked by nothing — which is the
// definition of a partial fix.
{
  // Tables that carry a user_id, read from the migrations rather than
  // listed here, so a new one is covered the day it exists.
  const sql = readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join("supabase/migrations", f), "utf8"))
    .join("\n");
  const owned = new Set();
  for (const m of sql.matchAll(
    /create table (?:if not exists )?(?:public\.)?([a-z_0-9]+)\s*\(((?:(?!create table)[\s\S])*?)\n\);/gi
  )) {
    if (/\buser_id\b/.test(m[2])) owned.add(m[1]);
  }
  check(`user-owned tables found in the schema (${owned.size})`, owned.size >= 50, String(owned.size));

  // WHICH FUNCTIONS DEPEND ON THE CALLER'S CLIENT.
  const dependents = new Map();
  for (const file of files) {
    const src = stripComments(readFileSync(file, "utf8"));
    for (const m of src.matchAll(/export (?:async )?function (\w+)\(([\s\S]{0,400}?)\)[\s\S]{0,60}?\{/g)) {
      const [, name, params] = m;
      if (!/supabase|client/i.test(params)) continue;
      // A userId parameter puts it under the rule above instead.
      if (/userId|user_id|userID/.test(params)) continue;
      const body = src.slice(m.index, m.index + 1400);
      for (const t of body.matchAll(/\.from\(\s*["'`]([a-z_0-9]+)["'`]\s*\)([\s\S]{0,400}?);/g)) {
        const [, table, tail] = t;
        if (!owned.has(table)) continue;
        if (/\.eq\(\s*["'`]user_id/.test(tail)) continue;
        if (/^\s*\.(insert|upsert)\(/.test(tail) && /user_id\s*:/.test(tail)) continue;
        dependents.set(name, { file, table });
      }
    }
  }
  // A FLOOR. "None of them is called with an admin client" is trivially
  // true of a scan that found no functions.
  check(
    `functions scoped by the caller's client (${dependents.size})`,
    dependents.size >= 5,
    [...dependents.keys()].join(", ")
  );

  // PASSING THE ADMIN CLIENT TO ONE OF THEM IS A DECISION, and it has to
  // be written down. Both of today's are addressed by an id that came
  // from an RLS-scoped read — a capability, not a guess — which is the
  // same argument the allowlist above uses and is just as invisible
  // without being stated.
  const ADMIN_CALLERS_ARGUED = {
    "updateMissionPlanSteps@src/app/api/cron/scheduled-runs/route.ts":
      "run.mission_id comes from a scheduled_agent_runs row, and api/mission/schedule-step creates those only after loading the mission through the USER'S client (RLS finds no stranger's id) and stamps user_id: user.id itself. The cron therefore addresses a mission its own owner scheduled.",
    "trySubmitAsBatch@src/app/api/cron/agent-runs/route.ts":
      "Takes the agent and the user it already loaded from user_agents, and writes agent_runs rows for that agent alone. The id is not attacker-supplied: this route reads no request body.",
    "collectAgentBatches@src/app/api/cron/agent-batches/route.ts":
      "Sweeps agent_runs in status 'queued' across all accounts on purpose — collecting Anthropic Batch results is a cross-account job by definition, and it settles each run against the account that owns it.",
  };

  const violations = [];
  let callSites = 0;
  for (const [name, where] of dependents) {
    for (const file of files) {
      const src = stripComments(readFileSync(file, "utf8"));
      // The call, and its first argument — either positional or the
      // property in an options object.
      for (const c of src.matchAll(new RegExp("\\b" + name + "\\(\\s*\\{?\\s*([A-Za-z_$][\\w$.]*)", "g"))) {
        if (file === where.file && /export (async )?function/.test(src.slice(Math.max(0, c.index - 40), c.index))) continue;
        callSites++;
        const arg = c[1];
        if (!/^admin$|^adminClient$|createAdminClient/.test(arg)) continue;
        const key = `${name}@${file}`;
        if (!(key in ADMIN_CALLERS_ARGUED)) {
          violations.push(`${key} passes ${arg} — a service-role client, for which RLS does not apply`);
        }
      }
    }
  }
  check(`the call sites were found (${callSites})`, callSites >= 5, String(callSites));
  check(
    "no unargued call site hands one of them a service-role client",
    violations.length === 0,
    violations.join("\n        ")
  );
  // AND THE ALLOWLIST STAYS HONEST, same rule as the one above it.
  const stale = Object.keys(ADMIN_CALLERS_ARGUED).filter((k) => !dependents.has(k.split("@")[0]));
  check("no argued entry names a function that no longer has this shape", stale.length === 0, stale.join(", "));
  check(
    "every argued entry gives a reason, not an assurance",
    Object.values(ADMIN_CALLERS_ARGUED).every((r) => r.length > 60 && !/^(safe|fine|ok)\b/i.test(r))
  );
}

console.log("\n== the three that started this stay fixed ==");
for (const f of [
  "src/lib/chat/mentor-context.ts",
  "src/lib/chat/product-mentor-context.ts",
  "src/lib/chat/trading-mentor-context.ts",
  "src/lib/ai/deep-dive-load.ts",
]) {
  const src = stripComments(readFileSync(f, "utf8"));
  check(
    `${f.split("/").pop()}: scopes its scan to the user`,
    /\.eq\("user_id", userId\)/.test(src),
    "this scan feeds a model prompt — RLS is the caller's property, not this query's"
  );
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
