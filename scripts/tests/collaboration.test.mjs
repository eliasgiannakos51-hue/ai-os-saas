// Collaborative projects (V3 Task 11).
//
// The property under test is that ACCESS HAS EXACTLY ONE DOOR. The
// schema deliberately leaves project_collaborators without an insert
// policy, which makes the accept route the only code path that can mint
// membership — so this suite pins the schema shape, the accept route's
// four checks, and the invite route's caller-client-only posture. If any
// of those loosens, sharing quietly becomes takeable rather than granted.
//
// Run: node scripts/tests/collaboration.test.mjs
import { readFileSync } from "node:fs";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond, detail) {
  check(name, Boolean(cond), true);
  if (!cond && detail) console.log(`        ${detail}`);
}

// Comments stripped before any regex runs — every SQL/TS gate in this
// repo learned that lesson the hard way.
const stripSql = (s) => s.replace(/--[^\n]*/g, "");
const stripTs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const backup = readFileSync("supabase_full_project_backup.sql", "utf8");
const sql = stripSql(backup);

console.log("== 1. the schema's one-door design ==");
for (const t of ["collaboration_invites", "project_collaborators", "collaboration_activity"]) {
  checkTrue(`${t} exists in the backup schema`, new RegExp(`create table if not exists public\\.${t}`).test(sql));
  checkTrue(`${t} has RLS enabled`, new RegExp(`alter table public\\.${t} enable row level security`).test(sql));
}

// The load-bearing absence: membership has NO insert policy, so only the
// service role (the accept route) can create it. The obvious permissive
// policy here would let owners seat people who never consented, or
// people seat themselves.
const collabPolicies = [...sql.matchAll(/create policy[^;]*?on\s+public\.project_collaborators[^;]*;/gis)].map(
  (m) => m[0]
);
checkTrue(
  "project_collaborators has NO insert policy",
  !collabPolicies.some((p) => /for insert/i.test(p)),
  "an insert policy here creates a second door into someone's project"
);
checkTrue(
  "project_collaborators has no update policy either (role change = revoke + reinvite)",
  !collabPolicies.some((p) => /for update/i.test(p))
);
checkTrue(
  "both sides can end the collaboration",
  collabPolicies.some((p) => /for delete/i.test(p) && /owner_id/.test(p) && /user_id/.test(p))
);

// Invites: writable by the inviter only, and the token column is unique
// (it is the credential).
checkTrue(
  "invite insert is bound to the inviter",
  /create policy[^;]*?on\s+public\.collaboration_invites[^;]*for insert[^;]*owner_id[^;]*;/is.test(sql)
);
checkTrue("the invite token is unique", /token text not null unique/.test(sql));

// Activity: append-only by construction.
const activityPolicies = [...sql.matchAll(/create policy[^;]*?on\s+public\.collaboration_activity[^;]*;/gis)].map(
  (m) => m[0]
);
checkTrue(
  "activity has no update or delete policy — history cannot be rewritten",
  !activityPolicies.some((p) => /for (update|delete)/i.test(p))
);

console.log("\n== 2. the mission grant is additive and bounded ==");
// Collaborators read; editors write; insert and delete stay owner-only.
checkTrue(
  "shared select policy exists via the definer function",
  /create policy "select_shared_ai_missions"[^;]*is_project_member/is.test(sql)
);
checkTrue(
  "shared update policy requires the editor role",
  /create policy "update_shared_ai_missions"[^;]*is_project_editor/is.test(sql)
);
checkTrue(
  "no shared INSERT policy on ai_missions",
  !/create policy[^;]*on\s+public\.ai_missions[^;]*for insert[^;]*is_project/is.test(sql)
);
checkTrue(
  "no shared DELETE policy on ai_missions — the project stays with the owner",
  !/create policy[^;]*on\s+public\.ai_missions[^;]*for delete[^;]*is_project/is.test(sql)
);
checkTrue(
  "the membership helpers are SECURITY DEFINER with a pinned search_path",
  /function public\.is_project_member[\s\S]*?security definer[\s\S]*?set search_path = public/i.test(sql) &&
    /function public\.is_project_editor[\s\S]*?security definer[\s\S]*?set search_path = public/i.test(sql)
);
checkTrue(
  "the helpers answer only for auth.uid() — they take no user parameter",
  !/is_project_member\s*\(\s*p_project_id uuid\s*,/.test(sql)
);

console.log("\n== 3. the pure rules ==");
const { loadTs } = await import("./load-ts.mjs");
const collab = await loadTs("src/lib/collaboration/collaboration.ts");

check("roles are exactly editor and viewer", [...collab.COLLABORATOR_ROLES], ["editor", "viewer"]);
checkTrue("owner can edit", collab.canEditProject("owner"));
checkTrue("editor can edit", collab.canEditProject("editor"));
checkTrue("viewer cannot", !collab.canEditProject("viewer"));

const NOW = new Date("2026-08-10T12:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
checkTrue("a 13-day-old invite is claimable", !collab.inviteExpired(daysAgo(13), NOW));
checkTrue("a 15-day-old invite is dead", collab.inviteExpired(daysAgo(15), NOW));
checkTrue("an unreadable date is dead, not eternal", collab.inviteExpired("garbage", NOW));

// The growth measurement: strictly after, so the metric undercounts
// rather than flatters.
checkTrue(
  "account created after the invite counts as invite-driven",
  collab.isInviteDrivenSignup({ inviteCreatedAt: daysAgo(2), accountCreatedAt: daysAgo(1) })
);
checkTrue(
  "account older than the invite does not",
  !collab.isInviteDrivenSignup({ inviteCreatedAt: daysAgo(1), accountCreatedAt: daysAgo(2) })
);
checkTrue(
  "same instant does not (clock artefacts must undercount)",
  !collab.isInviteDrivenSignup({ inviteCreatedAt: daysAgo(1), accountCreatedAt: daysAgo(1) })
);
check("email normalisation lowercases and trims", collab.normaliseInviteEmail("  A@B.Co "), "a@b.co");
check("a non-email is refused", collab.normaliseInviteEmail("not-an-email"), null);

console.log("\n== 4. the invite route never touches the service role ==");
const inviteRoute = stripTs(readFileSync("src/app/api/collaboration/invites/route.ts", "utf8"));
checkTrue("authenticates", /auth\.getUser\(\)/.test(inviteRoute));
checkTrue("rate limited", /checkRateLimit/.test(inviteRoute));
checkTrue(
  "NO admin client — RLS is the authorisation for everything it does",
  !/createAdminClient/.test(inviteRoute)
);
checkTrue("ownership is a filter and a miss is 404", /eq\("user_id", user\.id\)/.test(inviteRoute) && /404/.test(inviteRoute));
checkTrue("the token comes from crypto, not Math.random", /randomBytes\(16\)/.test(inviteRoute) && !/Math\.random/.test(inviteRoute));
checkTrue("self-invite is refused", /user\.email\.toLowerCase\(\)/.test(inviteRoute));

console.log("\n== 5. the accept route's four checks ==");
const acceptRoute = stripTs(readFileSync("src/app/api/collaboration/accept/route.ts", "utf8"));
checkTrue("authenticates", /auth\.getUser\(\)/.test(acceptRoute));
checkTrue("rate limited", /checkRateLimit/.test(acceptRoute));
checkTrue("check 1: pending status and expiry", /inviteExpired/.test(acceptRoute) && /"pending"/.test(acceptRoute));
checkTrue(
  "check 2: the accepting account's email must be the addressed one",
  /invite\.email !== user\.email\.toLowerCase\(\)/.test(acceptRoute)
);
checkTrue(
  "check 3: the inviter must still own the mission at accept time",
  /mission\.user_id !== invite\.owner_id/.test(acceptRoute)
);
checkTrue(
  "check 4: the claim is conditional on status still being pending",
  /\.eq\("status", "pending"\)/.test(acceptRoute)
);
checkTrue("signup attribution is recorded at accept", /isInviteDrivenSignup/.test(acceptRoute));

console.log("\n== 6. the wiring exists ==");
const missionPage = readFileSync("src/app/dashboard/mission/page.tsx", "utf8");
checkTrue("the mission page loads collaborations", /project_collaborators/.test(missionPage));
const detail = readFileSync("src/components/mission/mission-detail.tsx", "utf8");
checkTrue("the detail panel is role-aware", /accessRole/.test(detail));
checkTrue("the share tab exists for owners only", /accessRole === "owner"[\s\S]*?share/.test(detail));
const manifest = readFileSync("src/lib/gdpr/export-manifest.ts", "utf8");
checkTrue(
  "the GDPR export covers all three tables, without the token",
  /collaboration_invites/.test(manifest) &&
    /project_collaborators/.test(manifest) &&
    /collaboration_activity/.test(manifest) &&
    !/select: "[^"]*token/.test(manifest)
);

console.log(
  fail === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${fail} failed`
);
process.exit(fail === 0 ? 0 : 1);
