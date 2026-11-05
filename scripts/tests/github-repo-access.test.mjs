#!/usr/bin/env node
// WHO MAY ACT ON WHICH REPOSITORY, ASKED OF A STAND-IN GITHUB
// (2026-11-05, docs/SECURITY-AUDIT.md ΑΣ-1.15).
//
// WHAT WAS HARDENED. Coding's GitHub routes acted through an installation id
// stored at connect time, with tokens covering the whole installation, and
// never asked GitHub what THIS person may do on the repository named.
//
// The two gates that guarded this area, github-security and
// github-user-isolation, are source reads; both stayed green through it,
// because what they pinned — "the client uses an installation token, never
// the stored one" — WAS the defect. This file runs the real code instead:
// src/lib/github/permission.ts, auth.ts, validate.ts and client.ts, loaded by
// scripts/tests/load-ts.mjs with only `fetch` replaced by a stand-in GitHub
// that answers the way GitHub's own documentation says it does:
//
//   GET  /user/installations                       — per user token
//   GET  /user/installations/{id}/repositories     — only repositories the
//        token's person has explicit access to, each with `permissions`;
//        404 for an installation the person cannot reach
//   POST /app/installations/{id}/access_tokens     — App JWT (signature
//        verified here); without repository_ids the token reaches EVERY
//        repository of the installation, without permissions it carries
//        everything the App holds — exactly GitHub's behaviour, so a mint
//        that forgets either is visible in what the token can reach
//   /repos/{owner}/{name}/...                      — 404 for a repository
//        outside the token's scope, 403 for a write it may not make
//
// No port is opened (billing-coverage.test.mjs forbids it in a gate) and any
// URL outside api.github.com throws, so nothing here reaches a network.
//
// Run: node scripts/tests/github-repo-access.test.mjs
import { generateKeyPairSync, createVerify } from "node:crypto";
import { loadTs } from "./load-ts.mjs";

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

// ---------------------------------------------------------------------------
// The App's identity: a real key pair, so the mint's JWT is really verified.
// ---------------------------------------------------------------------------
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const APP_ID = "424242";
process.env.GITHUB_APP_ID = APP_ID;
process.env.GITHUB_APP_PRIVATE_KEY = Buffer.from(privateKey).toString("base64");

// ---------------------------------------------------------------------------
// The world. One organisation installation (acme) with repository A
// (acme/app), B (acme/secret) and a docs repository, behind 150 others so
// that A is on the SECOND page of the person's listing. One personal
// installation (alice).
// ---------------------------------------------------------------------------
const P_WRITE = { admin: false, maintain: false, push: true, triage: true, pull: true };
const P_READ = { admin: false, maintain: false, push: false, triage: false, pull: true };
const P_ADMIN = { admin: true, maintain: true, push: true, triage: true, pull: true };

const REPOS = new Map();
function addRepo(id, owner, name) {
  REPOS.set(id, { id, owner, name, full_name: `${owner}/${name}`, private: true, default_branch: "main" });
}
const FILLER = Array.from({ length: 150 }, (_, i) => 1000 + i);
for (const id of FILLER) addRepo(id, "acme", `filler-${id}`);
addRepo(1, "acme", "app"); // A
addRepo(2, "acme", "secret"); // B — nobody below may reach it
addRepo(3, "acme", "docs");
addRepo(10, "alice", "site");

const APP_PERMISSIONS = { metadata: "read", contents: "write", pull_requests: "write", issues: "write", checks: "read" };
const INSTALLATIONS = new Map([
  [101, { account: "acme", repos: [...FILLER, 1, 2, 3] }],
  [202, { account: "alice", repos: [10] }],
]);

/** user token -> who they are. `failInstallations`/`failRepos` simulate GitHub
 *  refusing the person's own calls. */
const USERS = {
  "tok-alice": {
    installations: [101, 202],
    access: new Map([...FILLER.map((id) => [id, P_READ]), [1, P_WRITE], [3, P_READ], [10, P_ADMIN]]),
  },
  "tok-reader": { installations: [101], access: new Map([[1, P_READ]]) },
  "tok-removed": { installations: [], access: new Map() },
  "tok-expired": { failInstallations: { status: 401 } },
  "tok-gone": { installations: [101], access: new Map([[1, P_WRITE]]), failRepos: { status: 404 } },
  "tok-forbidden": { installations: [101], access: new Map([[1, P_WRITE]]), failRepos: { status: 403 } },
  "tok-ratelimited": { failInstallations: { status: 403, headers: { "x-ratelimit-remaining": "0" } } },
  "tok-down": { failInstallations: { status: 500 } },
  "tok-offline": { throws: true },
};

/** Files that already exist in A, with their blob sha. GitHub's Contents
 *  API refuses to overwrite one without its CURRENT sha (422), and refuses
 *  a sha for a path that does not exist — the stand-in does the same. */
const EXISTING = new Map([
  ["README.md", "c".repeat(40)],
  ["docs/guide.md", "d".repeat(40)],
]);

const tokens = new Map(); // installation token -> { installationId, repoIds, permissions }
const log = []; // every request, in order
let mintMode = "honest"; // "honest" | "ignores-scope"
let tokenSeq = 0;

function json(status, body, headers = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function verifyJwt(auth) {
  const jwt = auth?.replace(/^Bearer /, "") ?? "";
  const [h, p, sig] = jwt.split(".");
  if (!h || !p || !sig) return false;
  const ok = createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, sig, "base64url");
  const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  return ok && String(payload.iss) === APP_ID;
}

function page(items, url) {
  const per = Math.min(Number(url.searchParams.get("per_page") ?? 30), 100);
  const n = Number(url.searchParams.get("page") ?? 1);
  return items.slice((n - 1) * per, n * per);
}

const WRITE_NEEDS = [
  [/^POST \/git\/refs$/, "contents"],
  [/^PUT \/contents\//, "contents"],
  [/^POST \/pulls$/, "pull_requests"],
  [/^PUT \/pulls\/\d+\/merge$/, "contents"],
];

async function fakeGitHub(input, init = {}) {
  const url = new URL(typeof input === "string" ? input : input.url); // resolves dot segments, as real fetch does
  if (url.origin !== "https://api.github.com") throw new Error(`network call outside the stand-in: ${url.href}`);
  const method = (init.method ?? "GET").toUpperCase();
  const auth = init.headers?.Authorization ?? init.headers?.authorization;
  const bearer = auth?.replace(/^Bearer /, "");
  const entry = { method, path: url.pathname, page: url.searchParams.get("page"), bearer };
  log.push(entry);

  // ---- the person's own calls ------------------------------------------
  if (url.pathname === "/user/installations" || url.pathname.startsWith("/user/installations/")) {
    const user = USERS[bearer];
    entry.kind = "user";
    if (!user) return json(401, { message: "Bad credentials" });
    if (user.throws) throw new TypeError("fetch failed");
    if (user.failInstallations) return json(user.failInstallations.status, { message: "no" }, user.failInstallations.headers);
    if (url.pathname === "/user/installations") {
      const list = user.installations.map((id) => ({ id, account: { login: INSTALLATIONS.get(id).account } }));
      return json(200, { total_count: list.length, installations: page(list, url) });
    }
    const m = url.pathname.match(/^\/user\/installations\/(\d+)\/repositories$/);
    if (!m) return json(404, { message: "Not Found" });
    if (user.failRepos) return json(user.failRepos.status, { message: "no" });
    const id = Number(m[1]);
    if (!user.installations.includes(id)) return json(404, { message: "Not Found" });
    const visible = INSTALLATIONS.get(id)
      .repos.filter((rid) => user.access.has(rid))
      .map((rid) => {
        const r = REPOS.get(rid);
        return { ...r, owner: { login: r.owner }, permissions: user.access.get(rid) };
      });
    return json(200, { total_count: visible.length, repositories: page(visible, url) });
  }

  // ---- the App minting an installation token ---------------------------
  const mint = url.pathname.match(/^\/app\/installations\/(\d+)\/access_tokens$/);
  if (mint && method === "POST") {
    entry.kind = "mint";
    if (!verifyJwt(auth)) return json(401, { message: "A JSON web token could not be decoded" });
    const installationId = Number(mint[1]);
    const inst = INSTALLATIONS.get(installationId);
    if (!inst) return json(404, { message: "Not Found" });
    const body = init.body ? JSON.parse(init.body) : {};
    entry.body = body;
    let repoIds = Array.isArray(body.repository_ids) ? body.repository_ids : null;
    if (repoIds && repoIds.some((id) => !inst.repos.includes(id))) return json(422, { message: "not in installation" });
    const permissions = body.permissions ?? APP_PERMISSIONS;
    if (mintMode === "ignores-scope") repoIds = null;
    const token = `ghs_${++tokenSeq}`;
    const reach = repoIds ?? inst.repos;
    tokens.set(token, { installationId, repoIds: reach, permissions });
    return json(201, {
      token,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      permissions,
      repository_selection: repoIds ? "selected" : "all",
      ...(repoIds ? { repositories: repoIds.map((id) => ({ id })) } : {}),
    });
  }

  // ---- repository calls with an installation token ---------------------
  const repoCall = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/);
  if (repoCall) {
    entry.kind = "repo";
    const scope = tokens.get(bearer);
    if (!scope) return json(401, { message: "Bad credentials" });
    const [, owner, name, restRaw] = repoCall;
    const rest = restRaw ?? "";
    const repo = [...REPOS.values()].find((r) => r.full_name.toLowerCase() === `${owner}/${name}`.toLowerCase());
    entry.repo = repo?.full_name ?? `${owner}/${name}`;
    if (!repo || !scope.repoIds.includes(repo.id)) return json(404, { message: "Not Found" });
    for (const [re, perm] of WRITE_NEEDS) {
      if (re.test(`${method} ${rest}`) && scope.permissions[perm] !== "write") {
        return json(403, { message: "Resource not accessible by integration" });
      }
    }
    entry.served = true;
    if (method === "GET" && rest === "/branches") return json(200, [{ name: "main" }, { name: "dev" }]);
    if (method === "GET" && rest.startsWith("/git/trees/")) return json(200, { tree: [{ path: "README.md", type: "blob", size: 5 }] });
    if (method === "GET" && rest.startsWith("/git/ref/heads/")) return json(200, { object: { sha: "b".repeat(40) } });
    if (method === "POST" && rest === "/git/refs") return json(201, {});
    if (method === "GET" && rest.startsWith("/contents/")) {
      const file = decodeURIComponent(rest.slice(10));
      if (!EXISTING.has(file)) return json(404, { message: "Not Found" });
      return json(200, { path: file, type: "file", sha: EXISTING.get(file), encoding: "base64", content: Buffer.from("hello").toString("base64"), size: 5 });
    }
    if (method === "GET" && rest === "/contents") return json(200, [{ path: "README.md", type: "file", size: 5 }]);
    if (method === "PUT" && rest.startsWith("/contents/")) {
      const file = decodeURIComponent(rest.slice(10));
      const body = JSON.parse(init.body ?? "{}");
      entry.body = body;
      if (EXISTING.has(file) && body.sha !== EXISTING.get(file)) return json(422, { message: "\"sha\" wasn't supplied." });
      if (!EXISTING.has(file) && body.sha !== undefined) return json(422, { message: "sha does not match" });
      return json(EXISTING.has(file) ? 200 : 201, {});
    }
    if (method === "POST" && rest === "/pulls") return json(201, { number: 7, html_url: `https://github.com/${repo.full_name}/pull/7`, title: "t" });
    if (method === "PUT" && /^\/pulls\/\d+\/merge$/.test(rest)) return json(200, { merged: true });
    if (method === "GET" && /^\/pulls\/\d+$/.test(rest)) return json(200, { state: "open", merged: false, head: { sha: "a".repeat(40) } });
    if (method === "GET" && /^\/commits\/[0-9a-f]{40}\/check-runs$/.test(rest)) return json(200, { check_runs: [{ name: "ci", status: "completed", conclusion: "success" }] });
    return json(404, { message: "Not Found" });
  }

  entry.kind = "unknown";
  return json(404, { message: "Not Found" });
}

globalThis.fetch = fakeGitHub;
const quietErrors = console.error;
console.error = () => {};

const gh = await loadTs("src/lib/github/client.ts");
const {
  GITHUB_OPERATIONS,
  grantRepoOperation,
  listVisibleRepos,
  parseRepoFullName,
  parsePullNumber,
  isValidBranchName,
  isValidRepoPath,
  listBranches,
  listFiles,
  readFile,
  getTree,
  createBranch,
  createBranchCommitAndPr,
  mergePullRequest,
  getPullRequestStatus,
} = gh;

const OPERATIONS = Object.keys(GITHUB_OPERATIONS);
const WRITES = OPERATIONS.filter((op) => GITHUB_OPERATIONS[op].needs === "write");
const READS = OPERATIONS.filter((op) => GITHUB_OPERATIONS[op].needs === "read");
const since = (n) => log.slice(n);
const mintsSince = (n) => since(n).filter((e) => e.kind === "mint");

// ===========================================================================
console.log("== 1. every repository operation the routes perform is in the table ==");
// ===========================================================================
// The population: one operation per route directory that names a repository.
// github-security.test.mjs holds each route to calling its own.
check(
  `six operations, three reads and three writes (${OPERATIONS.join(", ")})`,
  OPERATIONS.length === 6 && READS.length === 3 && WRITES.length === 3,
  `reads: ${READS.join(", ")} | writes: ${WRITES.join(", ")}`
);
check(
  "merge, commit and create-branch need write",
  ["merge", "commit", "create-branch"].every((op) => GITHUB_OPERATIONS[op]?.needs === "write")
);
check(
  "no operation asks for a permission the App was not given (NEEDS 11) or for more than read on checks",
  OPERATIONS.every((op) =>
    Object.entries(GITHUB_OPERATIONS[op].permissions).every(
      ([k, v]) => k in APP_PERMISSIONS && (k !== "checks" || v === "read") && (k !== "metadata" || v === "read")
    )
  )
);
check(
  "reads ask for no write permission at all",
  READS.every((op) => Object.values(GITHUB_OPERATIONS[op].permissions).every((v) => v === "read"))
);

// ===========================================================================
console.log("\n== 2. repository B, which the person cannot see, is refused for EVERY operation ==");
// ===========================================================================
for (const op of OPERATIONS) {
  const mark = log.length;
  const r = await grantRepoOperation("tok-alice", "acme", "secret", op);
  check(
    `${op}: acme/secret refused (404, repo_not_found) with no token minted`,
    !r.ok && r.refusal.status === 404 && r.refusal.reason === "repo_not_found" && mintsSince(mark).length === 0,
    JSON.stringify(r.ok ? { granted: r.grant.fullName } : r.refusal) + ` mints=${mintsSince(mark).length}`
  );
}
for (const op of OPERATIONS) {
  const mark = log.length;
  const r = await grantRepoOperation("tok-alice", "elsewhere", "thing", op);
  check(
    `${op}: an owner with no installation the person can reach is refused`,
    !r.ok && r.refusal.status === 404 && mintsSince(mark).length === 0
  );
}

// ===========================================================================
console.log("\n== 3. a read-only person: reads yes, every write refused ==");
// ===========================================================================
for (const op of WRITES) {
  const mark = log.length;
  const r = await grantRepoOperation("tok-reader", "acme", "app", op);
  check(
    `${op}: refused for a person with pull only (403, read_only), no token minted`,
    !r.ok && r.refusal.status === 403 && r.refusal.reason === "read_only" && !r.refusal.connection && mintsSince(mark).length === 0,
    JSON.stringify(r.ok ? { granted: true } : r.refusal)
  );
}
for (const op of READS) {
  const r = await grantRepoOperation("tok-reader", "acme", "app", op);
  check(`${op}: granted for a person with pull`, r.ok);
}

// ===========================================================================
console.log("\n== 4. a person with push: granted, and the token reaches ONE repository ==");
// ===========================================================================
const grants = {};
for (const op of OPERATIONS) {
  const mark = log.length;
  const r = await grantRepoOperation("tok-alice", "acme", "app", op);
  const mints = mintsSince(mark);
  const userCalls = since(mark).filter((e) => e.kind === "user");
  // What was ASKED of GitHub is judged whether or not a grant came back:
  // the mint's response check refuses a token wider than asked for, so a
  // mint that forgot its scope also fails "granted" — and must still be
  // named for what it forgot.
  check(`${op}: exactly one token minted`, mints.length === 1, `mints=${mints.length}`);
  check(
    `${op}: the minted token is repo-scoped (repository_ids === [A])`,
    JSON.stringify(mints[0]?.body?.repository_ids) === JSON.stringify([1]),
    JSON.stringify(mints[0]?.body)
  );
  check(
    `${op}: ...with exactly the permissions the operation needs`,
    JSON.stringify(mints[0]?.body?.permissions) === JSON.stringify(GITHUB_OPERATIONS[op].permissions),
    `${JSON.stringify(mints[0]?.body?.permissions)} vs ${JSON.stringify(GITHUB_OPERATIONS[op].permissions)}`
  );
  check(
    `${op}: the person's own calls came first, the mint last`,
    userCalls.length >= 2 && mints.length === 1 && since(mark).indexOf(mints[0]) === since(mark).length - 1
  );
  check(
    `${op}: A sits on the person's SECOND page, and the lookup reached it`,
    userCalls.some((e) => e.path === "/user/installations/101/repositories" && e.page === "2")
  );
  check(`${op}: granted on acme/app`, r.ok, r.ok ? "" : JSON.stringify(r.refusal));
  if (!r.ok) continue;
  grants[op] = r.grant;
  check(`${op}: the stand-in token can reach A and nothing else`, JSON.stringify(tokens.get(r.grant.headers.Authorization.slice(7))?.repoIds) === "[1]");
}
{
  // Her personal installation is SECOND in her list: the installation is the
  // owner's, not whichever one GitHub happened to return first.
  const mark = log.length;
  const r = await grantRepoOperation("tok-alice", "alice", "site", "merge");
  check(
    "the installation is the one of the owner named, not the first in the list",
    r.ok && r.grant.installationId === 202 && mintsSince(mark)[0]?.path === "/app/installations/202/access_tokens",
    JSON.stringify(r.ok ? { installationId: r.grant.installationId } : r.refusal)
  );
}
{
  const r = await grantRepoOperation("tok-alice", "ACME", "App", "files");
  check(
    "a case-different name resolves to GitHub's own spelling",
    r.ok && r.grant.owner === "acme" && r.grant.name === "app" && r.grant.fullName === "acme/app"
  );
}

// ===========================================================================
console.log("\n== 5. GitHub saying no, or not answering, refuses — and says when to reconnect ==");
// ===========================================================================
const deaths = [
  ["tok-expired", "a token GitHub refuses (401)", 403, "reconnect", "expired"],
  ["tok-gone", "an installation the person lost (404 on their call)", 403, "reconnect", "revoked"],
  ["tok-forbidden", "an installation the person lost (403 on their call)", 403, "reconnect", "revoked"],
  ["tok-removed", "a person removed from the organisation", 404, "repo_not_found", undefined],
  ["tok-ratelimited", "a rate limit (403, remaining 0) is not lost access", 502, "github_unavailable", undefined],
  ["tok-down", "GitHub failing (500)", 502, "github_unavailable", undefined],
  ["tok-offline", "GitHub unreachable (fetch throws)", 502, "github_unavailable", undefined],
];
for (const [token, what, status, reason, connection] of deaths) {
  for (const op of ["files", "merge"]) {
    const mark = log.length;
    const r = await grantRepoOperation(token, "acme", "app", op);
    check(
      `${what}: ${op} refused (${status} ${reason}${connection ? `, connection ${connection}` : ""}), nothing minted`,
      !r.ok &&
        r.refusal.status === status &&
        r.refusal.reason === reason &&
        r.refusal.connection === connection &&
        mintsSince(mark).length === 0,
      JSON.stringify(r.ok ? { granted: true } : r.refusal)
    );
  }
}
{
  mintMode = "ignores-scope";
  const mark = log.length;
  const r = await grantRepoOperation("tok-alice", "acme", "app", "merge");
  mintMode = "honest";
  check(
    "a token GitHub hands back wider than asked for is refused, not used",
    !r.ok && r.refusal.status === 502 && mintsSince(mark).length === 1,
    JSON.stringify(r.ok ? { granted: true } : r.refusal)
  );
}

// ===========================================================================
console.log("\n== 6. the repository picker lists only what the person can see ==");
// ===========================================================================
{
  const mark = log.length;
  const v = await listVisibleRepos("tok-alice");
  const names = v.ok ? v.repos.map((r) => r.fullName) : [];
  check("alice sees A, docs and her own site", v.ok && ["acme/app", "acme/docs", "alice/site"].every((n) => names.includes(n)));
  check("alice does not see B", v.ok && !names.includes("acme/secret"));
  check(`...across both pages of the organisation (${names.length} listed)`, v.ok && names.length === 153, `${names.length}`);
  check("listing mints no installation token at all", mintsSince(mark).length === 0);
  const reader = await listVisibleRepos("tok-reader");
  check(
    "the read-only person sees exactly A",
    reader.ok && JSON.stringify(reader.repos.map((r) => r.fullName)) === '["acme/app"]',
    JSON.stringify(reader.ok ? reader.repos.map((r) => r.fullName) : reader.refusal)
  );
  const removed = await listVisibleRepos("tok-removed");
  check("a removed member sees nothing", removed.ok && removed.repos.length === 0 && removed.installations === 0);
  const expired = await listVisibleRepos("tok-expired");
  check("a dead token asks for a reconnect", !expired.ok && expired.refusal.connection === "expired");
}

// ===========================================================================
console.log("\n== 7. the client does nothing without a grant issued for that operation ==");
// ===========================================================================
{
  const forged = Object.freeze({ ...grants.merge });
  let mark = log.length;
  const a = await mergePullRequest(forged, 7);
  check("a copied grant (same token, not issued) is refused with no request", !a.ok && log.length === mark);
  mark = log.length;
  const b = await mergePullRequest(grants.files, 7);
  check("a read grant cannot merge — refused with no request", !b.ok && log.length === mark);
  mark = log.length;
  const c = await createBranchCommitAndPr(grants["pr-status"], {
    baseBranch: "main", newBranch: "x", files: [{ path: "a.txt", action: "create", content: "x" }], commitMessage: "m", prTitle: "t", prBody: "",
  });
  check("a pr-status grant cannot commit — refused with no request", !c.ok && log.length === mark);
  let threw = false;
  try {
    grants.files.name = "secret";
  } catch {
    threw = true;
  }
  check("a grant cannot be pointed at another repository after it is issued", threw && grants.files.name === "app");
}

// ===========================================================================
console.log("\n== 8. every call a grant makes lands on A ==");
// ===========================================================================
{
  const mark = log.length;
  const branches = await listBranches(grants.branches);
  const tree = await getTree(grants.files, "main");
  const file = await readFile(grants.files, "main", "README.md");
  const listing = await listFiles(grants.files, "main", "");
  const created = await createBranch(grants["create-branch"], "main", "feature/x");
  const committed = await createBranchCommitAndPr(grants.commit, {
    baseBranch: "main", newBranch: "ionexa-1", files: [{ path: "web/index.html", action: "create", content: "x" }], commitMessage: "m", prTitle: "t", prBody: "",
  });
  const merged = await mergePullRequest(grants.merge, 7);
  const status = await getPullRequestStatus(grants["pr-status"], 7);
  const repoCalls = since(mark).filter((e) => e.kind === "repo");
  check(
    "branches, tree, file, listing, branch, commit+PR, merge and status all succeed",
    branches.length === 2 && tree.length === 1 && file?.content === "hello" && listing.length === 1 &&
      created.ok && committed.ok && merged.ok && status.ok && status.status.checks.length === 1,
    JSON.stringify({ branches: branches.length, tree: tree.length, file: !!file, listing: listing.length, created, committed: committed.ok, merged, status: status.ok })
  );
  check(
    `all ${repoCalls.length} repository calls were on acme/app and every one was served`,
    repoCalls.length >= 12 && repoCalls.every((e) => e.repo === "acme/app" && e.served),
    repoCalls.filter((e) => e.repo !== "acme/app" || !e.served).map((e) => `${e.method} ${e.path}`).join(", ")
  );
  check(
    "the merge was a squash on pull 7 of A",
    since(mark).some((e) => e.method === "PUT" && e.path === "/repos/acme/app/pulls/7/merge")
  );
}

// ===========================================================================
console.log("\n== 8b. a commit that changes a file that exists, and the PR link it returns ==");
// ===========================================================================
// The Coding screen sends files with a path and content only: it opens a
// file, edits it, commits — and cannot know which paths already exist.
// Until 2026-11-05 the client sent an existing file's sha only when the
// screen said `action: "update"`, which it never did, so every edit of an
// opened file would have been refused by GitHub.
{
  const mark = log.length;
  const committed = await createBranchCommitAndPr(grants.commit, {
    baseBranch: "main",
    newBranch: "ionexa-3",
    files: [
      { path: "README.md", content: "edited" },
      { path: "web/new-page.html", content: "<p>new</p>" },
    ],
    commitMessage: "m",
    prTitle: "t",
    prBody: "",
  });
  const puts = since(mark).filter((e) => e.method === "PUT" && e.path.includes("/contents/"));
  const putOf = (file) => puts.find((e) => e.path === `/repos/acme/app/contents/${file}`);
  check(
    "a commit that edits an existing file and adds a new one succeeds",
    committed.ok,
    JSON.stringify(committed)
  );
  check(
    "...the existing file is sent with its CURRENT sha",
    putOf("README.md")?.body?.sha === EXISTING.get("README.md"),
    JSON.stringify(putOf("README.md")?.body ?? null)
  );
  check(
    "...and the new file with none",
    putOf("web/new-page.html") !== undefined && putOf("web/new-page.html").body?.sha === undefined,
    JSON.stringify(putOf("web/new-page.html")?.body ?? null)
  );
  check(
    "the PR comes back with the `url` the Coding screen links to",
    committed.ok && committed.pr.url === "https://github.com/acme/app/pull/7" && committed.pr.number === 7,
    JSON.stringify(committed.ok ? committed.pr : committed)
  );
}

// ===========================================================================
console.log("\n== 9. a path or a pull number is checked before it reaches a URL ==");
// ===========================================================================
{
  const climb = "../../secret/contents/config.yml";
  check(
    "the URL parser resolves dot segments (why the path check exists at all)",
    new URL(`https://api.github.com/repos/acme/app/contents/${climb.split("/").map(encodeURIComponent).join("/")}`).pathname ===
      "/repos/acme/secret/contents/config.yml"
  );
  let mark = log.length;
  const read = await readFile(grants.files, "main", climb);
  check("readFile refuses a climbing path with no request", read === null && log.length === mark);
  mark = log.length;
  const listed = await listFiles(grants.files, "main", "docs/../..");
  check("listFiles refuses a climbing path with no request", listed.length === 0 && log.length === mark);
  mark = log.length;
  const commit = await createBranchCommitAndPr(grants.commit, {
    baseBranch: "main", newBranch: "ionexa-2", files: [{ path: climb, action: "create", content: "x" }], commitMessage: "m", prTitle: "t", prBody: "",
  });
  check("a commit with a climbing path is refused with no request", !commit.ok && log.length === mark);
  for (const bad of [0, -1, 1.5, Number.NaN, "7", 2 ** 53]) {
    mark = log.length;
    const m = await mergePullRequest(grants.merge, bad);
    const s = await getPullRequestStatus(grants["pr-status"], bad);
    check(`merge and status refuse pull number ${JSON.stringify(bad)} with no request`, !m.ok && !s.ok && log.length === mark);
  }
}

// ===========================================================================
console.log("\n== 10. the request's names are checked before any URL is built ==");
// ===========================================================================
const repoCases = [
  ["acme/app", { owner: "acme", name: "app" }],
  ["my-org/repo.name_1", { owner: "my-org", name: "repo.name_1" }],
  ["acme/app/extra", null],
  ["acme", null],
  ["/app", null],
  ["acme/", null],
  ["-acme/app", null],
  ["acme-/app", null],
  ["ac_me/app", null],
  ["acme/..", null],
  ["acme/.", null],
  ["../app", null],
  ["acme/a%2fb", null],
  ["acme/a b", null],
  ["a".repeat(40) + "/app", null],
  ["acme/" + "r".repeat(101), null],
  [42, null],
  [null, null],
];
for (const [input, want] of repoCases) {
  check(`repo ${JSON.stringify(input)} -> ${JSON.stringify(want)}`, JSON.stringify(parseRepoFullName(input)) === JSON.stringify(want));
}
const prCases = [
  [7, 7], ["7", 7], ["123", 123],
  [0, null], [-1, null], [1.5, null], [Number.NaN, null], [2 ** 53, null], [Number.POSITIVE_INFINITY, null],
  ["0", null], ["07", null], ["-7", null], ["+7", null], ["7.0", null], ["1e3", null], [" 7", null], ["7/merge", null],
  ["7?x=1", null], ["", null], ["9".repeat(17), null], [null, null], [{}, null],
];
for (const [input, want] of prCases) {
  check(`pr ${JSON.stringify(input)} -> ${JSON.stringify(want)}`, parsePullNumber(input) === want);
}
const branchCases = [
  ["main", true], ["feature/login", true], ["ionexa-1730000000", true], ["release-1.2", true],
  ["", false], ["..", false], ["a..b", false], ["-x", false], ["/x", false], ["x/", false], ["x.", false],
  ["x.lock", false], ["a/.hidden", false], ["a b", false], ["a~b", false], ["a^b", false], ["a:b", false],
  ["a?b", false], ["a*b", false], ["a[b", false], ["a\\b", false], ["a@{b", false], ["@", false], ["a//b", false],
  ["x\u0000", false], [7, false],
];
for (const [input, want] of branchCases) {
  check(`branch ${JSON.stringify(input)} -> ${want}`, isValidBranchName(input) === want);
}
const pathCases = [
  ["README.md", false, true], ["src/app/page.tsx", false, true], ["", true, true], ["", false, false],
  ["..", false, false], ["a/../b", false, false], ["./a", false, false], ["a//b", false, false], ["/a", false, false],
  ["a/", false, false], ["a\u0000b", false, false], [5, false, false],
];
for (const [input, root, want] of pathCases) {
  check(`path ${JSON.stringify(input)}${root ? " (root allowed)" : ""} -> ${want}`, isValidRepoPath(input, root) === want);
}

console.error = quietErrors;
const unknown = log.filter((e) => e.kind === "unknown");
check("the stand-in was never asked for something it does not model", unknown.length === 0, unknown.map((e) => `${e.method} ${e.path}`).join(", "));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
