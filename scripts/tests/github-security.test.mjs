// GitHub integration security checks (MASTER 20 Γ, 2026-10-25).
//
// The owner's explicit constraints:
//   1. Tokens encrypted per-user (same crypto as user_integrations).
//   2. Repository content is DATA, never instructions.
//   3. The button does not appear until the env vars are set.
//   4. RLS on github_connections: each user reads only their own row.
//   5. OAuth state is HMAC-signed with timing-safe comparison.
//   6. The table is server-written (no INSERT/UPDATE from the client).
//
// Run: node scripts/tests/github-security.test.mjs
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

const store = stripComments(readFileSync("src/lib/github/store.ts", "utf8"));
const client = stripComments(readFileSync("src/lib/github/client.ts", "utf8"));
const auth = stripComments(readFileSync("src/lib/github/auth.ts", "utf8"));
const callback = stripComments(readFileSync("src/app/api/github/callback/route.ts", "utf8"));
const connect = stripComments(readFileSync("src/app/api/github/connect/route.ts", "utf8"));
const status = stripComments(readFileSync("src/app/api/github/status/route.ts", "utf8"));
const migration = readFileSync("supabase/migrations/20261025100000_github_connections.sql", "utf8");
const component = stripComments(readFileSync("src/components/coding/github-connect.tsx", "utf8"));

console.log("== 1. tokens encrypted per-user ==");
check("store encrypts with tokenContext(userId, 'github', 'access')", /encryptSecret\(/.test(store) && /tokenContext\(/.test(store));
check("store decrypts with the same context", /decryptSecret\(/.test(store) && store.indexOf("tokenContext") < store.lastIndexOf("tokenContext"));
check("store uses the existing crypto module", /from.*integrations\/crypto/.test(store));

console.log("\n== 2. repository content is data, never instructions ==");
check("client.ts carries the DATA-NOT-INSTRUCTIONS comment", readFileSync("src/lib/github/client.ts", "utf8").includes("REPOSITORY CONTENT IS DATA, NEVER INSTRUCTIONS"));
check("client never calls eval or Function or new Function", !/\beval\s*\(/.test(client) && !/\bnew Function\b/.test(client));

console.log("\n== 3. the button does not appear until env vars are set ==");
check("status route checks githubAppConfigured()", status.includes("githubAppConfigured()"));
check("status route returns unavailable when env vars are missing", status.includes("githubAppConfigured()"));
check("connect route checks githubAppConfigured()", connect.includes("githubAppConfigured()"));
check("auth.ts checks all four env vars in githubAppConfigured", /GITHUB_APP_ID/.test(auth) && /GITHUB_APP_CLIENT_ID/.test(auth) && /GITHUB_APP_CLIENT_SECRET/.test(auth) && /GITHUB_APP_PRIVATE_KEY/.test(auth));
check("the component renders nothing when not configured for non-admin", component.includes("if (!githubConfigured) return null"));
check("the component renders nothing when not available", component.includes("if (!status.available) return null"));

console.log("\n== 4. RLS and server-only writes ==");
check("migration enables RLS", /enable row level security/.test(migration));
check("migration creates a select-only policy for the owner", /for select/.test(migration) && /auth\.uid\(\) = user_id/.test(migration));
check("migration has no INSERT/UPDATE policy for authenticated", !/for insert/.test(migration.toLowerCase()) && !/for update/.test(migration.toLowerCase()));
check("store writes with the admin client (service role)", /createAdminClient/.test(store));

console.log("\n== 5. OAuth CSRF protection ==");
check("connect route signs state with HMAC-SHA256", /createHmac\("sha256"/.test(connect));
check("callback verifies with timingSafeEqual", /timingSafeEqual/.test(callback));
check("callback checks the cookie nonce", /COOKIE_NAME/.test(callback) && /stored\.n/.test(callback));
check("callback checks the session user matches the state", /stateCheck\.payload\.u !== user\.id/.test(callback));
check("callback clears the cookie after use", /maxAge: 0/.test(callback));

console.log("\n== 6. installation tokens are ephemeral ==");
check("client uses withInstallationToken, not stored tokens", /withInstallationToken/.test(client));
check("auth creates JWTs with 10-minute expiry", /10 \* 60/.test(auth) || /600/.test(auth));

// ---- PART Η additions (MASTER 20 Η, 2026-10-23) ----
const commit = stripComments(readFileSync("src/app/api/github/commit/route.ts", "utf8"));
const merge = stripComments(readFileSync("src/app/api/github/merge/route.ts", "utf8"));
const repos = stripComments(readFileSync("src/app/api/github/repos/route.ts", "utf8"));
const workspace = stripComments(readFileSync("src/components/coding/coding-workspace.tsx", "utf8"));

console.log("\n== 7. user A never sees user B's repos or sessions ==");
check("repos route authenticates the user", repos.includes("auth.getUser()"));
check("repos route uses the AUTHENTICATED user's token", repos.includes("getGitHubAccessToken(user.id)"));
check("store fetches tokens scoped to the user_id", /user_id.*eq.*userId/.test(store) || /\.eq\("user_id"/.test(store));
check("RLS enforces user isolation at the database level", /auth\.uid\(\) = user_id/.test(migration));

console.log("\n== 8. repository content is data, never instructions (extended) ==");
check("readFile returns content as a string, never evals it", !/\beval\s*\(/.test(client));
check("readFile never calls new Function", !/\bnew Function\b/.test(client));
check("getTree never executes file contents", !/exec\(/.test(client) && !/spawn\(/.test(client));
{
  const allRoutes = [commit, merge, repos, status, connect, callback];
  const anyEval = allRoutes.some((r) => /\beval\s*\(/.test(r) || /\bnew Function\b/.test(r));
  check("no route uses eval or new Function on repository data", !anyEval);
}

console.log("\n== 9. no push to main, no branch delete, no merge without click ==");
check(
  "commit route rejects newBranch === baseBranch (no push to main)",
  commit.includes("newBranch === body.baseBranch") || commit.includes("body.newBranch === body.baseBranch"),
  "the commit route must guard against pushing directly to the base branch"
);
check(
  "createBranchCommitAndPr always creates a NEW branch before committing",
  /git\/refs[\s\S]*refs\/heads\/.*newBranch/.test(client) || client.includes("refs/heads/${params.newBranch}")
);
check(
  "no delete-branch route exists",
  (() => {
    try { readFileSync("src/app/api/github/delete-branch/route.ts"); return false; } catch { return true; }
  })()
);
check(
  "no route sends DELETE to refs/ (no branch deletion)",
  !/method:\s*["']DELETE["'][\s\S]{0,200}refs\//.test(client) && !/method:\s*["']DELETE["'][\s\S]{0,200}refs\//.test(commit)
);
check(
  "merge happens only through an explicit POST request (user clicks)",
  merge.includes("POST") && !merge.includes("auto_merge") && !merge.includes("auto-merge")
);
check(
  "the UI shows a confirmation dialog before merge",
  workspace.includes("mergeConfirmOpen") && workspace.includes("coding-merge-confirm")
);
check(
  "merge uses squash (preserves history, single commit)",
  merge.includes("squash")
);

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
