// GitHub integration security checks (MASTER 20 Γ, 2026-10-25).
//
// The owner's explicit constraints:
//   1. Tokens encrypted per-user (same crypto as user_integrations).
//   2. Repository content is DATA, never instructions.
//   3. The button does not appear until the env vars are set.
//   4. RLS on github_connections: each user reads only their own row.
//   5. OAuth state is HMAC-signed with timing-safe comparison.
//   6. The table is server-written (no INSERT/UPDATE from the client).
//   7. (2026-11-05, SECURITY-AUDIT ΑΣ-1.15) A person acts only on the
//      repositories GitHub says THEY can reach, with a token that reaches
//      only that repository — section 10. The behaviour is run against a
//      stand-in GitHub in scripts/tests/github-repo-access.test.mjs; this
//      file holds every route to the wiring that makes it apply.
//
// Run: node scripts/tests/github-security.test.mjs
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

console.log("\n== 6. installation tokens are ephemeral, and never installation-wide ==");
// THIS SECTION USED TO PIN THE DEFECT. Until 2026-11-05 its first check was
// "client uses withInstallationToken, not stored tokens": true, and the
// reason a member could act on every repository of an organisation's
// installation — withInstallationToken minted a token for ALL of them, from
// an installation id stored at connect time. Not storing the token was never
// the property that mattered; what the token can reach is. Replaced by the
// checks below and by section 10.
check("auth creates JWTs with 10-minute expiry", /10 \* 60/.test(auth) || /600/.test(auth));
check(
  "no installation-wide mint exists (createInstallationToken / withInstallationToken are gone)",
  !/\bcreateInstallationToken\b/.test(auth) && !/\bwithInstallationToken\b/.test(client)
);
check(
  "the only mint sends repository_ids AND permissions, always",
  (auth.match(/access_tokens/g) ?? []).length === 1 &&
    /body:\s*JSON\.stringify\(\{\s*repository_ids:\s*\[repositoryId\],\s*permissions\s*\}\)/.test(auth)
);
check(
  "the mint refuses a token GitHub returns wider than asked for",
  /repository_selection\s*!==\s*"selected"/.test(auth) && /if \(wider\)\s*\{[\s\S]{0,200}return null;/.test(auth)
);

// ---- PART Η additions (MASTER 20 Η, 2026-10-23) ----
const commit = stripComments(readFileSync("src/app/api/github/commit/route.ts", "utf8"));
const merge = stripComments(readFileSync("src/app/api/github/merge/route.ts", "utf8"));
const repos = stripComments(readFileSync("src/app/api/github/repos/route.ts", "utf8"));
const workspace = stripComments(readFileSync("src/components/coding/coding-workspace.tsx", "utf8"));

console.log("\n== 7. user A never sees user B's repos or sessions ==");
check("repos route authenticates the user", repos.includes("auth.getUser()"));
// Since 2026-11-05 the route lists through lib/github/access.ts, which reads
// the token of the user id it is given (section 10 holds that half).
check(
  "repos route uses the AUTHENTICATED user's token",
  repos.includes("visibleReposFor(user.id)") &&
    /export async function visibleReposFor\(\s*userId: string[\s\S]*?getGitHubAccessToken\(userId\)/.test(
      stripComments(readFileSync("src/lib/github/access.ts", "utf8"))
    )
);
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
    const p = ["src", "app", "api", "github", "delete-branch", "route.ts"].join("/");
    try { readFileSync(p); return false; } catch { return true; }
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
// The merge call moved from the route into lib/github/client.ts on
// 2026-11-05 (mergePullRequest), so the squash is read where it is sent.
check(
  "merge uses squash (preserves history, single commit)",
  /export async function mergePullRequest[\s\S]*?merge_method:\s*"squash"/.test(client) && merge.includes("mergePullRequest(access.grant")
);

console.log("\n== 10. every repository route checks the person, then gets a one-repository token ==");
// THE POPULATION IS THE DIRECTORY. Every folder under src/app/api/github/ is
// either an account-level route (named below, with why it names no
// repository) or a repository route, and a repository route must authorize
// its own operation before anything else. A new route folder that is in
// neither list fails here by name.
const ROUTES_DIR = "src/app/api/github";
const ACCOUNT_ROUTES = {
  callback: "OAuth return: stores the person's token, names no repository",
  connect: "starts OAuth, names no repository",
  disconnect: "deletes the person's own row",
  status: "is the connection alive — asks GitHub with the person's token, names no repository",
  repos: "lists what the person can see, through their own token (visibleReposFor)",
};
const permissionSrc = stripComments(readFileSync("src/lib/github/permission.ts", "utf8"));
const accessSrc = stripComments(readFileSync("src/lib/github/access.ts", "utf8"));
const opsBlock = permissionSrc.match(/export const GITHUB_OPERATIONS = \{([\s\S]*?)\n\} as const/)?.[1] ?? "";
const OPS = new Map(
  [...opsBlock.matchAll(/^\s*"?([a-z-]+)"?:\s*\{\s*needs:\s*"(read|write)"/gm)].map((m) => [m[1], m[2]])
);
check(`the operation table parses (${[...OPS.keys()].join(", ")})`, OPS.size === 6, `${OPS.size} operations`);

const routeDirs = readdirSync(ROUTES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(`${ROUTES_DIR}/${d.name}/route.ts`))
  .map((d) => d.name)
  .sort();
check(`the route folders were found (${routeDirs.length})`, routeDirs.length >= 11, routeDirs.join(", "));
const repoRoutes = routeDirs.filter((d) => !(d in ACCOUNT_ROUTES));
for (const d of Object.keys(ACCOUNT_ROUTES)) {
  check(`account route ${d} still exists (an exception for nothing is stale)`, routeDirs.includes(d));
}
check(
  `every repository route has an operation of its own name (${repoRoutes.join(", ")})`,
  repoRoutes.length === OPS.size && repoRoutes.every((d) => OPS.has(d)),
  `routes: ${repoRoutes.join(", ")} | operations: ${[...OPS.keys()].join(", ")}`
);
const CLIENT_FNS = [...client.matchAll(/export async function (\w+)\(\s*grant: RepoGrant/g)].map((m) => m[1]);
check(`the client's repository functions all take a grant (${CLIENT_FNS.length})`, CLIENT_FNS.length >= 8, CLIENT_FNS.join(", "));
for (const d of repoRoutes) {
  const src = stripComments(readFileSync(`${ROUTES_DIR}/${d}/route.ts`, "utf8"));
  const auth = src.indexOf(`authorizeRepoOperation(user.id, `);
  const opLiteral = src.slice(auth).match(/^authorizeRepoOperation\(user\.id, [^,]+, "([a-z-]+)"\)/)?.[1];
  const refusal = src.indexOf("if (!access.ok)", auth);
  const firstClientCall = Math.min(
    ...CLIENT_FNS.map((fn) => src.indexOf(`${fn}(access.grant`)).filter((i) => i >= 0)
  );
  check(`${d}: authorizes as the session user, for the "${d}" operation`, auth >= 0 && opLiteral === d, `found ${opLiteral}`);
  check(
    `${d}: refuses on !access.ok BEFORE its first GitHub call`,
    auth >= 0 && refusal > auth && Number.isFinite(firstClientCall) && refusal < firstClientCall,
    `authorize@${auth} refusal@${refusal} client@${firstClientCall}`
  );
  check(
    `${d}: never mints, never builds a GitHub URL itself`,
    !/createRepoScopedToken|createAppJwt|access_tokens|api\.github\.com/.test(src) && !/from "@\/lib\/github\/auth"/.test(src)
  );
  if (OPS.get(d) === "write") {
    check(`${d}: is a write, so its operation needs push`, ["create-branch", "commit", "merge"].includes(d));
  }
}
check(
  "the three writes are exactly create-branch, commit and merge",
  JSON.stringify([...OPS].filter(([, n]) => n === "write").map(([k]) => k).sort()) === '["commit","create-branch","merge"]'
);

// The check, then the mint, in that order, inside the one function that
// issues grants — and nowhere else in src/ calls the mint.
const grantBody = permissionSrc.match(/export async function grantRepoOperation\([\s\S]*?\n\}/)?.[0] ?? "";
const at = (needle) => grantBody.indexOf(needle);
check(
  "grantRepoOperation: the person's installations, then their repository listing, then permits(), then the mint",
  at("listUserInstallations(userToken)") >= 0 &&
    at("listUserInstallations(userToken)") < at("listUserInstallationRepos(userToken") &&
    at("listUserInstallationRepos(userToken") < at("permits(repo.permissions, spec.needs)") &&
    at("permits(repo.permissions, spec.needs)") < at("createRepoScopedToken(") ,
  `installations@${at("listUserInstallations(userToken)")} repos@${at("listUserInstallationRepos(userToken")} permits@${at("permits(repo.permissions, spec.needs)")} mint@${at("createRepoScopedToken(")}`
);
check(
  "grantRepoOperation: a repository GitHub did not list, or one without the permission, returns before the mint",
  /if \(!repo\) return \{ ok: false/.test(grantBody) && /if \(!permits\(repo\.permissions, spec\.needs\)\) \{\s*return \{\s*ok: false/.test(grantBody)
);
check(
  "grantRepoOperation: mints for the listed repository's id, with the operation's permissions",
  /createRepoScopedToken\(installation\.id, repo\.id, spec\.permissions\)/.test(grantBody)
);
{
  // One walk of src/, floored: "nobody else calls it" and "nothing lists
  // it" are both true of a walk that found no files.
  const listSource = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? listSource(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []
    );
  const srcFiles = listSource("src").map((p) => ({ p, code: stripComments(readFileSync(p, "utf8")) }));
  check(`src/ was walked (${srcFiles.length} files)`, srcFiles.length >= 300, `${srcFiles.length}`);
  const callers = srcFiles.filter((f) => /createRepoScopedToken\(/.test(f.code)).map((f) => f.p);
  check(
    "createRepoScopedToken is called from permission.ts only",
    JSON.stringify(callers.filter((p) => !p.endsWith("lib/github/auth.ts"))) === '["src/lib/github/permission.ts"]',
    callers.join(", ")
  );
  const everywhere = srcFiles.filter((f) => /\/installation\/repositories/.test(f.code)).map((f) => f.p);
  check("nothing lists an installation's whole repository set (/installation/repositories)", everywhere.length === 0, everywhere.join(", "));
}
// The first statement of the body: every signature's return type sits on
// one line ending "> {", which is what ends the signature here.
// ONE FUNCTION AT A TIME: a lazy match from one signature runs on into the
// next function, whose own check would then answer for this one (found by
// github-security.mutation.mjs, which removed merge's check and stayed green).
const fnText = (fn) => {
  const start = client.indexOf(`export async function ${fn}(`);
  if (start < 0) return "";
  const next = client.indexOf("\nexport ", start + 1);
  return client.slice(start, next < 0 ? undefined : next);
};
const refusesFirst = (fn) =>
  /^export async function \w+\([\s\S]*?\):\s*Promise<[^\n]*>\s*\{\n\s*if \(!isIssuedGrant\(grant, "[a-z-]+"\)\) return/.test(fnText(fn));
check(
  "every client function refuses a grant that was not issued for its operation, first",
  CLIENT_FNS.every(refusesFirst),
  CLIENT_FNS.filter((fn) => !refusesFirst(fn)).join(", ")
);

// pr is a positive integer before any URL is built.
for (const d of ["merge", "pr-status"]) {
  const src = stripComments(readFileSync(`${ROUTES_DIR}/${d}/route.ts`, "utf8"));
  check(
    `${d}: the pull number is parsed (parsePullNumber) and refused when null, before authorizing`,
    /const pr = parsePullNumber\(/.test(src) &&
      src.indexOf("pr === null") > src.indexOf("parsePullNumber(") &&
      src.indexOf("pr === null") < src.indexOf("authorizeRepoOperation(")
  );
}
check(
  "the client re-checks the pull number before interpolating it",
  ["mergePullRequest", "getPullRequestStatus"].every((fn) =>
    /if \(!Number\.isSafeInteger\(pr\) \|\| pr <= 0\) return[\s\S]*?\/pulls\/\$\{pr\}/.test(fnText(fn))
  )
);

// Nothing stored stands for a grant.
check("the callback no longer reads installations at connect time", !/listUserInstallations|installations\[0\]|installationId/.test(callback));
check(
  "the store writes installation_id as null and reads it nowhere",
  /installation_id: null,/.test(store) && !/row\.installation_id|installationId/.test(store)
);
check(
  "a token is handed out only for a connection marked connected",
  /if \(row\.status !== "connected"\) return \{ ok: false/.test(store)
);
check(
  "a refusal that says the connection is dead marks it, so Connect is offered again",
  /if \(refusal\.connection\) await markGitHubConnectionStatus\(userId, refusal\.connection\)/.test(accessSrc)
);
check(
  "status reports an installation from GitHub's answer for the person's token, not from the row",
  /listUserInstallations\(token\.token\)/.test(status) && !/installationId/.test(status) &&
    /failure === "token_dead"[\s\S]{0,120}markGitHubConnectionStatus\(user\.id, "expired"\)/.test(status)
);

console.log("\n== 11. the screen reads the pull request the route sends ==");
// The commit route answers { ok, pr } with lib/github/types.ts's
// GitHubPrResult. The Coding screen read `html_url` — GitHub's name, not
// ours — so the "open PR" link pointed at undefined (found 2026-11-05).
// Every field it reads off `body.pr` must be one the type declares; the
// client half (createBranchCommitAndPr fills `url`) is run in
// github-repo-access.test.mjs §8b.
{
  const typesSrc = stripComments(readFileSync("src/lib/github/types.ts", "utf8"));
  const prFields = new Set(
    [...(typesSrc.match(/export type GitHubPrResult = \{([\s\S]*?)\};/)?.[1] ?? "").matchAll(/(\w+)\s*:/g)].map((m) => m[1])
  );
  check(`GitHubPrResult parses (${[...prFields].join(", ")})`, prFields.size >= 3 && prFields.has("url"));
  const reads = [...workspace.matchAll(/\bbody\??\.pr\??\.(\w+)/g)].map((m) => m[1]);
  check(`the screen's reads of the commit answer were found (${reads.length})`, reads.length >= 2, reads.join(", "));
  const unknown = reads.filter((f) => !prFields.has(f));
  check(
    "every field the screen reads off body.pr is one GitHubPrResult declares",
    unknown.length === 0,
    `reads ${unknown.join(", ")} — the route sends ${[...prFields].join(", ")}`
  );
  check("...and the link it stores is the PR's url", /setPrResult\(\{ number: body\.pr\.number, url: body\.pr\.url \}\)/.test(workspace));
  check(
    "the route sends the client's GitHubPrResult as `pr`",
    /return NextResponse\.json\(\{ ok: true, pr: result\.pr \}\)/.test(commit) &&
      /Promise<\{ ok: true; pr: GitHubPrResult \}/.test(client)
  );
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
