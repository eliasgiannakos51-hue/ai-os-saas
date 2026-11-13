#!/usr/bin/env node
// GitHub user isolation gate (Part Η, MASTER 20 Γ, 2026-10-23).
//
// The owner's explicit security constraint: "Ο χρήστης Α δεν βλέπει ποτέ
// repository ή session του Β."
//
// This test verifies the structural isolation — RLS policies, server-side
// user scoping, and the absence of any cross-user data path.
//
// AND, SINCE 2026-11-05, THE ISOLATION THAT WAS MISSING (SECURITY-AUDIT
// ΑΣ-1.15): "user A never sees user B" held for Ionexa accounts and not for
// GitHub ones. Two Ionexa users in the same GitHub organisation reached the
// same installation, and every repository in it, whatever GitHub let each of
// them see. Section 4 used to say "installation tokens are per-user, never
// shared" while the token was the installation's — shared by construction.
// Now each person's own GitHub token decides; sections 4 and 5 hold the
// wiring, and scripts/tests/github-repo-access.test.mjs runs it against a
// stand-in GitHub with two people who see different repositories.
//
// Run: node scripts/tests/github-user-isolation.test.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
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

const migration = readFileSync("supabase/migrations/20261025100000_github_connections.sql", "utf8");
const store = stripComments(readFileSync("src/lib/github/store.ts", "utf8"));
const reposRoute = stripComments(readFileSync("src/app/api/github/repos/route.ts", "utf8"));

console.log("== 1. RLS: each user reads only their own row ==");
check("github_connections has RLS enabled", /enable row level security/i.test(migration));
check("select policy scoped to auth.uid() = user_id", /auth\.uid\(\)\s*=\s*user_id/.test(migration));
check("no INSERT policy for authenticated role", !/for insert/i.test(migration));
check("no UPDATE policy for authenticated role", !/for update/i.test(migration));

console.log("\n== 2. every API route authenticates the caller ==");
// Every folder under src/app/api/github/, not a list of five: merge,
// pr-status, create-branch, connect, callback and disconnect were never in
// the list this section used to name.
const ROUTES_DIR = "src/app/api/github";
const routeDirs = readdirSync(ROUTES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(`${ROUTES_DIR}/${d.name}/route.ts`))
  .map((d) => d.name)
  .sort();
check(`the route folders were found (${routeDirs.length})`, routeDirs.length >= 11, routeDirs.join(", "));
const routeSrc = new Map(routeDirs.map((d) => [d, stripComments(readFileSync(`${ROUTES_DIR}/${d}/route.ts`, "utf8"))]));
for (const [d, src] of routeSrc) {
  check(`${d} route checks supabase user`, src.includes("supabase.auth.getUser()"));
}

console.log("\n== 3. store reads scoped to the caller's userId ==");
check("getGitHubConnection takes userId", /getGitHubConnection\(\s*userId/s.test(store));
check("getGitHubAccessToken takes userId", /getGitHubAccessToken\(\s*userId/s.test(store));
check("store filters by user_id in queries", store.includes(".eq(\"user_id\"") || store.includes(".eq('user_id'"));

console.log("\n== 4. every repository decision is made with the session user's own GitHub token ==");
const access = stripComments(readFileSync("src/lib/github/access.ts", "utf8"));
const ACCOUNT_ROUTES = new Set(["callback", "connect", "disconnect", "status", "repos"]);
for (const [d, src] of routeSrc) {
  if (ACCOUNT_ROUTES.has(d)) continue;
  check(`${d}: authorizes as user.id from the session`, /authorizeRepoOperation\(user\.id, /.test(src));
  check(
    `${d}: takes no user or token from the request`,
    !/searchParams\.get\("(?:user|userId|token|installation\w*)"\)|body\??\.(?:userId|user_id|token|installationId)\b/.test(src)
  );
}
check("repos route lists for user.id from the session", reposRoute.includes("visibleReposFor(user.id)"));
check(
  "access.ts reads the token of the user id it was given, in both entry points",
  (access.match(/getGitHubAccessToken\(userId\)/g) ?? []).length === 2 &&
    /export async function authorizeRepoOperation\(\s*userId: string/.test(access) &&
    /export async function visibleReposFor\(\s*userId: string/.test(access)
);
check(
  "...and decides with that token, never an installation stored for anyone",
  /grantRepoOperation\(token\.token, /.test(access) && /listVisibleRepos\(token\.token\)/.test(access) && !/installation/i.test(access.replace(/listVisibleRepos|installations/g, ""))
);

console.log("\n== 5. nothing stored at connect time stands for access later ==");
const callback = stripComments(readFileSync("src/app/api/github/callback/route.ts", "utf8"));
check("the callback stores no installation", !/installations\[0\]|installationId/.test(callback));
check("the store clears installation_id on every (re)connect", /installation_id: null,/.test(store));
check("getGitHubAccessToken returns the token alone, with no installation", /return \{ ok: true, token \};/.test(store) && !/installationId/.test(store));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
