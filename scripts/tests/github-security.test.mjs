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
check("status route checks the feature flag", /isFeatureOn\("coding-github"/.test(status));
check("connect route checks githubAppConfigured()", connect.includes("githubAppConfigured()"));
check("auth.ts checks all four env vars in githubAppConfigured", /GITHUB_APP_ID/.test(auth) && /GITHUB_APP_CLIENT_ID/.test(auth) && /GITHUB_APP_CLIENT_SECRET/.test(auth) && /GITHUB_APP_PRIVATE_KEY/.test(auth));
check("the component renders nothing when not available", /if \(!status \|\| !status\.available\) return null/.test(component));

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

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
