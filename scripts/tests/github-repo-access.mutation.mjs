#!/usr/bin/env node
/*
 * DOES github-repo-access.test.mjs SEE A PERSON ACTING ON A REPOSITORY
 * GITHUB DID NOT GIVE THEM?
 *
 * Each mutant puts back the defect of 2026-11-05 (SECURITY-AUDIT ΑΣ-1.15)
 * one piece at a time — the check skipped, the token installation-wide, the
 * first installation trusted, a path allowed to climb — or the plausible
 * edit that would quietly undo one wall of the fix. The stand-in GitHub in
 * the gate must go red on the clause named for each.
 *
 * Run: node scripts/tests/github-repo-access.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/github-repo-access.test.mjs";
const PERMISSION = "src/lib/github/permission.ts";
const AUTH = "src/lib/github/auth.ts";
const CLIENT = "src/lib/github/client.ts";
const VALIDATE = "src/lib/github/validate.ts";

const MUTANTS = [
  {
    name: "the person's permission is never consulted",
    file: PERMISSION,
    from: "  if (!permits(repo.permissions, spec.needs)) {",
    to: "  if (!permits(repo.permissions, spec.needs) && false) {",
    expect: "refused for a person with pull only",
  },
  {
    name: "a write accepts pull (the read-only member can merge)",
    file: PERMISSION,
    from: "  if (needs === \"write\") return write;",
    to: "  if (needs === \"write\") return write || permissions.pull === true;",
    expect: "merge: refused for a person with pull only",
  },
  {
    name: "the token is minted for the whole installation (no repository_ids)",
    file: AUTH,
    from: "        body: JSON.stringify({ repository_ids: [repositoryId], permissions }),",
    to: "        body: JSON.stringify({ permissions }),",
    expect: "the minted token is repo-scoped",
  },
  {
    name: "the token carries everything the App holds (no permissions)",
    file: AUTH,
    from: "        body: JSON.stringify({ repository_ids: [repositoryId], permissions }),",
    to: "        body: JSON.stringify({ repository_ids: [repositoryId] }),",
    expect: "with exactly the permissions the operation needs",
  },
  {
    name: "a token GitHub returns wider than asked for is used anyway",
    file: AUTH,
    from: "    if (wider) {",
    to: "    if (wider && false) {",
    expect: "a token GitHub hands back wider than asked for is refused",
  },
  {
    name: "the first installation in the list is trusted (the original defect)",
    file: PERMISSION,
    from: "  const installation = installations.value.find((i) => i.account.toLowerCase() === owner.toLowerCase());",
    to: "  const installation = installations.value[0];",
    expect: "the installation is the one of the owner named, not the first in the list",
  },
  {
    name: "the owner is matched case-sensitively",
    file: PERMISSION,
    from: "  const installation = installations.value.find((i) => i.account.toLowerCase() === owner.toLowerCase());",
    to: "  const installation = installations.value.find((i) => i.account === owner);",
    expect: "a case-different name resolves to GitHub's own spelling",
  },
  {
    name: "the person's listing is read one page only",
    file: PERMISSION,
    from: "const MAX_REPO_PAGES = 30;",
    to: "const MAX_REPO_PAGES = 1;",
    expect: "A sits on the person's SECOND page",
  },
  {
    name: "a 401 on the person's token is read as lost access, not a dead token",
    file: PERMISSION,
    from: "  if (response.status === 401) return \"token_dead\";",
    to: "  if (response.status === 401) return \"access_gone\";",
    expect: "a token GitHub refuses (401)",
  },
  {
    name: "a 404 on the person's call is read as GitHub being down",
    file: PERMISSION,
    from: "  if (response.status === 404) return \"access_gone\";",
    to: "  if (response.status === 404) return \"unavailable\";",
    expect: "an installation the person lost (404 on their call)",
  },
  {
    name: "a rate limit marks the connection as lost",
    file: PERMISSION,
    from: "    if (response.headers.get(\"x-ratelimit-remaining\") === \"0\" || response.headers.has(\"retry-after\")) {",
    to: "    if (response.headers.has(\"x-never-sent\")) {",
    expect: "a rate limit (403, remaining 0) is not lost access",
  },
  {
    name: "the picker stops after the first installation",
    file: PERMISSION,
    from: "    repos.push(...listing.value.repos);\n  }",
    to: "    repos.push(...listing.value.repos);\n    break;\n  }",
    expect: "alice sees A, docs and her own site",
  },
  {
    name: "any object with a token passes as a grant",
    file: PERMISSION,
    from: "    ISSUED_GRANTS.has(grant) &&",
    to: "    \"headers\" in grant &&",
    expect: "a copied grant (same token, not issued) is refused with no request",
  },
  {
    name: "a grant works for any operation",
    file: PERMISSION,
    from: "    (grant as RepoGrant).operation === operation",
    to: "    typeof operation === \"string\"",
    expect: "a read grant cannot merge",
  },
  {
    name: "a grant can be re-pointed after it is issued",
    file: PERMISSION,
    from: "  const grant: RepoGrant = Object.freeze({",
    to: "  const grant: RepoGrant = ({",
    expect: "a grant cannot be pointed at another repository after it is issued",
  },
  {
    name: "a path may climb out of the repository",
    file: VALIDATE,
    from: "  return raw.split(\"/\").every((segment) => segment !== \"\" && segment !== \".\" && segment !== \"..\");",
    to: "  return raw.split(\"/\").every((segment) => segment !== \"\");",
    expect: "readFile refuses a climbing path with no request",
  },
  {
    name: "the client drops its own pull-number check",
    file: CLIENT,
    from: "  if (!isIssuedGrant(grant, \"merge\")) return { ok: false, reason: \"not_permitted\" };\n  if (!Number.isSafeInteger(pr) || pr <= 0) return { ok: false, reason: \"invalid_pr\" };",
    to: "  if (!isIssuedGrant(grant, \"merge\")) return { ok: false, reason: \"not_permitted\" };",
    expect: "merge and status refuse pull number",
  },
  {
    name: "a pull number is anything Number() can read",
    file: VALIDATE,
    from: "  if (typeof raw === \"string\" && /^[1-9][0-9]{0,15}$/.test(raw)) {",
    to: "  if (typeof raw === \"string\" && Number(raw) > 0) {",
    expect: "pr \"1e3\" -> null",
  },
  {
    name: "owner/repo split the old way, keeping whatever follows",
    file: VALIDATE,
    from: "  if (parts.length !== 2) return null;",
    to: "  if (parts.length < 2) return null;",
    expect: "repo \"acme/app/extra\" -> null",
  },
  {
    name: "a repository may be named ..",
    file: VALIDATE,
    from: "  if (!GITHUB_REPO_NAME_RE.test(name) || name === \".\" || name === \"..\") return null;",
    to: "  if (!GITHUB_REPO_NAME_RE.test(name)) return null;",
    expect: "repo \"acme/..\" -> null",
  },
  {
    name: "an existing file is committed without its sha (the edit GitHub refuses)",
    file: CLIENT,
    from: "        existingSha = body.sha;",
    to: "        existingSha = undefined;",
    expect: "the existing file is sent with its CURRENT sha",
  },
  {
    name: "the PR comes back without the url the screen links to",
    file: CLIENT,
    from: "        url: prBody.html_url ?? \"\",",
    to: "        url: \"\",",
    expect: "the PR comes back with the `url` the Coding screen links to",
  },
  {
    name: "a branch name may contain ..",
    file: VALIDATE,
    from: "  if (raw.includes(\"..\") || raw.includes(\"@{\") || raw.includes(\"//\")) return false;",
    to: "  if (raw.includes(\"@{\") || raw.includes(\"//\")) return false;",
    expect: "branch \"..\" -> false",
  },
];

runMutations({
  name: "github-repo-access",
  gate: GATE,
  targets: [PERMISSION, AUTH, CLIENT, VALIDATE],
  mutants: MUTANTS,
});
