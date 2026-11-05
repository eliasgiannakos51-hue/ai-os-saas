#!/usr/bin/env node
/*
 * DOES github-security.test.mjs HOLD EVERY GITHUB ROUTE TO "CHECK THE
 * PERSON, THEN A ONE-REPOSITORY TOKEN"?
 *
 * Section 10 of the gate is a read of the wiring; the behaviour is run in
 * github-repo-access.test.mjs. These mutants are the edits that would undo
 * the wiring without touching the behaviour's own module: a route that acts
 * before refusing, a route that reaches for the mint, a check moved after
 * the mint, the stored installation coming back (SECURITY-AUDIT ΑΣ-1.15).
 *
 * Run: node scripts/tests/github-security.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/github-security.test.mjs";
const MERGE = "src/app/api/github/merge/route.ts";
const PR_STATUS = "src/app/api/github/pr-status/route.ts";
const COMMIT = "src/app/api/github/commit/route.ts";
const CREATE_BRANCH = "src/app/api/github/create-branch/route.ts";
const CALLBACK = "src/app/api/github/callback/route.ts";
const STATUS = "src/app/api/github/status/route.ts";
const PERMISSION = "src/lib/github/permission.ts";
const AUTH = "src/lib/github/auth.ts";
const CLIENT = "src/lib/github/client.ts";
const STORE = "src/lib/github/store.ts";
const ACCESS = "src/lib/github/access.ts";

const MUTANTS = [
  {
    name: "merge acts first and refuses after",
    file: MERGE,
    from: "  if (!access.ok) {\n    return NextResponse.json({ ok: false, reason: access.reason }, { status: access.status });\n  }\n\n  const result = await mergePullRequest(access.grant, pr);",
    to: "  const result = await mergePullRequest(access.grant, pr);\n  if (!access.ok) {\n    return NextResponse.json({ ok: false, reason: access.reason }, { status: access.status });\n  }",
    expect: "merge: refuses on !access.ok BEFORE its first GitHub call",
  },
  {
    name: "commit authorizes a read instead of its own write",
    file: COMMIT,
    from: "  const access = await authorizeRepoOperation(user.id, body.repo, \"commit\");",
    to: "  const access = await authorizeRepoOperation(user.id, body.repo, \"files\");",
    expect: "commit: authorizes as the session user, for the \"commit\" operation",
  },
  {
    name: "create-branch reaches for the mint itself",
    file: CREATE_BRANCH,
    from: "import { createBranch } from \"@/lib/github/client\";",
    to: "import { createBranch } from \"@/lib/github/client\";\nimport { createRepoScopedToken } from \"@/lib/github/auth\";",
    expect: "create-branch: never mints, never builds a GitHub URL itself",
  },
  {
    name: "the mint happens before the permission check",
    file: PERMISSION,
    from: "  if (!permits(repo.permissions, spec.needs)) {\n    return {\n      ok: false,\n      refusal: spec.needs === \"write\" ? { status: 403, reason: \"read_only\" } : { status: 404, reason: \"repo_not_found\" },\n    };\n  }\n\n  const token = await createRepoScopedToken(installation.id, repo.id, spec.permissions);",
    to: "  const token = await createRepoScopedToken(installation.id, repo.id, spec.permissions);\n  if (!permits(repo.permissions, spec.needs)) {\n    return {\n      ok: false,\n      refusal: spec.needs === \"write\" ? { status: 403, reason: \"read_only\" } : { status: 404, reason: \"repo_not_found\" },\n    };\n  }",
    expect: "grantRepoOperation: the person's installations, then their repository listing, then permits(), then the mint",
  },
  {
    name: "every operation gets the merge token's permissions",
    file: PERMISSION,
    from: "  const token = await createRepoScopedToken(installation.id, repo.id, spec.permissions);",
    to: "  const token = await createRepoScopedToken(installation.id, repo.id, GITHUB_OPERATIONS.merge.permissions);",
    expect: "grantRepoOperation: mints for the listed repository's id, with the operation's permissions",
  },
  {
    name: "the mint goes back to installation-wide",
    file: AUTH,
    from: "        body: JSON.stringify({ repository_ids: [repositoryId], permissions }),",
    to: "        body: JSON.stringify({ permissions }),",
    expect: "the only mint sends repository_ids AND permissions, always",
  },
  {
    name: "a token wider than asked for is used",
    file: AUTH,
    from: "    if (wider) {",
    to: "    if (wider && false) {",
    expect: "the mint refuses a token GitHub returns wider than asked for",
  },
  {
    name: "merge takes the pull number as given",
    file: MERGE,
    from: "  const pr = parsePullNumber(body?.pr);",
    to: "  const pr = Number(body?.pr);",
    expect: "merge: the pull number is parsed (parsePullNumber) and refused when null, before authorizing",
  },
  {
    name: "pr-status authorizes before it has refused a bad pull number",
    file: PR_STATUS,
    from: "  if (!repo || pr === null) {\n    return NextResponse.json({ ok: false, error: \"Missing repo or pr.\" }, { status: 400 });\n  }\n\n  const access = await authorizeRepoOperation(user.id, repo, \"pr-status\");",
    to: "  const access = await authorizeRepoOperation(user.id, repo, \"pr-status\");\n  if (!repo || pr === null) {\n    return NextResponse.json({ ok: false, error: \"Missing repo or pr.\" }, { status: 400 });\n  }",
    expect: "pr-status: the pull number is parsed (parsePullNumber) and refused when null, before authorizing",
  },
  {
    name: "the client interpolates a pull number it has not checked",
    file: CLIENT,
    from: "  if (!isIssuedGrant(grant, \"merge\")) return { ok: false, reason: \"not_permitted\" };\n  if (!Number.isSafeInteger(pr) || pr <= 0) return { ok: false, reason: \"invalid_pr\" };",
    to: "  if (!isIssuedGrant(grant, \"merge\")) return { ok: false, reason: \"not_permitted\" };",
    expect: "the client re-checks the pull number before interpolating it",
  },
  {
    name: "merge takes any grant",
    file: CLIENT,
    from: "  if (!isIssuedGrant(grant, \"merge\")) return { ok: false, reason: \"not_permitted\" };\n  if (!Number.isSafeInteger(pr) || pr <= 0) return { ok: false, reason: \"invalid_pr\" };",
    to: "  if (!Number.isSafeInteger(pr) || pr <= 0) return { ok: false, reason: \"invalid_pr\" };",
    expect: "every client function refuses a grant that was not issued for its operation, first",
  },
  {
    name: "an installation-wide listing comes back",
    file: CLIENT,
    from: "function encodePath(path: string): string {",
    to: "export async function listAllInstallationRepos(headers: Record<string, string>) {\n  return fetch(`${GITHUB_API}/installation/repositories?per_page=100`, { headers });\n}\n\nfunction encodePath(path: string): string {",
    expect: "nothing lists an installation's whole repository set",
  },
  {
    name: "merge stops squashing",
    file: CLIENT,
    from: "      body: JSON.stringify({ merge_method: \"squash\" }),",
    to: "      body: JSON.stringify({ merge_method: \"merge\" }),",
    expect: "merge uses squash",
  },
  {
    name: "the callback stores the first installation again (the original defect)",
    file: CALLBACK,
    from: "    const saved = await saveGitHubConnection({",
    to: "    const installations = await listUserInstallations(tokenBody.access_token);\n    const installationId = installations.length > 0 ? installations[0].id : null;\n    const saved = await saveGitHubConnection({",
    expect: "the callback no longer reads installations at connect time",
  },
  {
    name: "an expired connection still hands out its token",
    file: STORE,
    from: "  if (row.status !== \"connected\") return { ok: false, reason: \"reconnect\" };",
    to: "  if (row.status === \"revoked\") return { ok: false, reason: \"revoked\" };",
    expect: "a token is handed out only for a connection marked connected",
  },
  {
    name: "a dead connection is never marked",
    file: ACCESS,
    from: "  if (refusal.connection) await markGitHubConnectionStatus(userId, refusal.connection);\n",
    to: "",
    expect: "a refusal that says the connection is dead marks it",
  },
  {
    name: "status keeps saying connected for a token GitHub refuses",
    file: STATUS,
    from: "          await markGitHubConnectionStatus(user.id, \"expired\");\n",
    to: "",
    expect: "status reports an installation from GitHub's answer for the person's token",
  },
];

runMutations({
  name: "github-security",
  gate: GATE,
  targets: [MERGE, PR_STATUS, COMMIT, CREATE_BRANCH, CALLBACK, STATUS, PERMISSION, AUTH, CLIENT, STORE, ACCESS],
  mutants: MUTANTS,
});
