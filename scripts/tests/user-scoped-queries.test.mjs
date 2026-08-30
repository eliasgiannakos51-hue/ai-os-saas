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
