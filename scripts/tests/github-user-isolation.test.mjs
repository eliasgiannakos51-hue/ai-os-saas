#!/usr/bin/env node
// GitHub user isolation gate (Part Η, MASTER 20 Γ, 2026-10-23).
//
// The owner's explicit security constraint: "Ο χρήστης Α δεν βλέπει ποτέ
// repository ή session του Β."
//
// This test verifies the structural isolation — RLS policies, server-side
// user scoping, and the absence of any cross-user data path.
//
// Run: node scripts/tests/github-user-isolation.test.mjs
import { readFileSync } from "node:fs";
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
const branchesRoute = stripComments(readFileSync("src/app/api/github/branches/route.ts", "utf8"));
const filesRoute = stripComments(readFileSync("src/app/api/github/files/route.ts", "utf8"));
const commitRoute = stripComments(readFileSync("src/app/api/github/commit/route.ts", "utf8"));
const statusRoute = stripComments(readFileSync("src/app/api/github/status/route.ts", "utf8"));

console.log("== 1. RLS: each user reads only their own row ==");
check("github_connections has RLS enabled", /enable row level security/i.test(migration));
check("select policy scoped to auth.uid() = user_id", /auth\.uid\(\)\s*=\s*user_id/.test(migration));
check("no INSERT policy for authenticated role", !/for insert/i.test(migration));
check("no UPDATE policy for authenticated role", !/for update/i.test(migration));

console.log("\n== 2. every API route authenticates the caller ==");
check("repos route checks supabase user", reposRoute.includes("supabase.auth.getUser()"));
check("branches route checks supabase user", branchesRoute.includes("supabase.auth.getUser()"));
check("files route checks supabase user", filesRoute.includes("supabase.auth.getUser()"));
check("commit route checks supabase user", commitRoute.includes("supabase.auth.getUser()"));
check("status route checks supabase user", statusRoute.includes("supabase.auth.getUser()"));

console.log("\n== 3. store reads scoped to the caller's userId ==");
check("getGitHubConnection takes userId", /getGitHubConnection\(\s*userId/s.test(store));
check("getGitHubAccessToken takes userId", /getGitHubAccessToken\(\s*userId/s.test(store));
check("store filters by user_id in queries", store.includes(".eq(\"user_id\"") || store.includes(".eq('user_id'"));

console.log("\n== 4. installation tokens are per-user, never shared ==");
check("repos route calls getGitHubAccessToken with the user's id", reposRoute.includes("getGitHubAccessToken(user.id)"));
check("commit route calls getGitHubAccessToken with the user's id", commitRoute.includes("getGitHubAccessToken(user.id)"));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
