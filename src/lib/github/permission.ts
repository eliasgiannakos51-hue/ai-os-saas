import "server-only";
import { logApiError } from "@/lib/log-error";
import { createRepoScopedToken, type RepoTokenPermissions } from "@/lib/github/auth";

// WHAT THIS PERSON MAY DO ON THIS REPOSITORY, ASKED OF GITHUB EVERY TIME
// (2026-11-05, SECURITY-AUDIT ΑΣ-1.15).
//
// Until this date repository operations went through an installation id
// stored at connect time and tokens that covered the whole installation, so
// what the person themselves may do on a repository was not consulted, and
// a change in their access on GitHub did not reach Ionexa.
//
// Now every repository operation goes through grantRepoOperation():
//
//   1. the installation is resolved at request time from the owner named,
//      among the installations the person's OWN token can reach;
//   2. the repository must be listed by
//      GET /user/installations/{id}/repositories for that token, which lists
//      only repositories the person has explicit access to, each with the
//      person's permissions on it;
//   3. reads need pull, writes need push (or maintain/admin);
//   4. only then is an installation token minted — for that one repository
//      id and only the permissions the operation needs (GITHUB_OPERATIONS).
//
// Any GitHub error on the way refuses (fail closed). A dead token (401) or a
// person whose access to the installation is gone (403/404 on the user call)
// is reported back with `connection`, and lib/github/access.ts marks the row
// so the Coding screen offers "Connect GitHub" again.
//
// Nothing is cached: a removed member is refused on the very next request.
// The cost is three GitHub calls before each operation.
//
// The user's token reaches this file as an argument; reading it from the
// database is lib/github/access.ts's half, so this file runs in
// scripts/tests/github-repo-access.test.mjs against a stand-in GitHub with
// only `fetch` replaced.

export const GITHUB_API = "https://api.github.com";
export const GITHUB_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
});

type Need = "read" | "write";

/** Every repository operation a route performs, what it needs from the
 *  person, and the narrowest token permissions that let it run. */
export const GITHUB_OPERATIONS = {
  files: { needs: "read", permissions: { metadata: "read", contents: "read" } },
  branches: { needs: "read", permissions: { metadata: "read", contents: "read" } },
  "pr-status": { needs: "read", permissions: { metadata: "read", pull_requests: "read", checks: "read" } },
  "create-branch": { needs: "write", permissions: { metadata: "read", contents: "write" } },
  commit: { needs: "write", permissions: { metadata: "read", contents: "write", pull_requests: "write" } },
  merge: { needs: "write", permissions: { metadata: "read", contents: "write", pull_requests: "write" } },
} as const satisfies Record<string, { needs: Need; permissions: RepoTokenPermissions }>;

export type GitHubOperation = keyof typeof GITHUB_OPERATIONS;

export type RepoPermissions = {
  admin?: boolean;
  maintain?: boolean;
  push?: boolean;
  triage?: boolean;
  pull?: boolean;
};

export type UserInstallation = { id: number; account: string };

export type UserRepo = {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  permissions: RepoPermissions;
};

/** Why a user-token call did not answer. */
export type GitHubFailure = "token_dead" | "access_gone" | "unavailable";

type Answer<T> = { ok: true; value: T } | { ok: false; failure: GitHubFailure };

export type Refusal = {
  status: number;
  reason: string;
  /** Set when the connection itself no longer works and must be redone. */
  connection?: "expired" | "revoked";
};

/** A repository operation the person may perform, with a token that can
 *  reach only that repository. Issued only by grantRepoOperation. */
export type RepoGrant = Readonly<{
  operation: GitHubOperation;
  installationId: number;
  repositoryId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  headers: Readonly<Record<string, string>>;
}>;

const ISSUED_GRANTS = new WeakSet<object>();

/** True only for a grant grantRepoOperation issued, for this operation.
 *  lib/github/client.ts calls it before every request it makes. */
export function isIssuedGrant(grant: unknown, operation: GitHubOperation): grant is RepoGrant {
  return (
    typeof grant === "object" &&
    grant !== null &&
    ISSUED_GRANTS.has(grant) &&
    (grant as RepoGrant).operation === operation
  );
}

/** pull (or anything above it) reads; push, maintain or admin writes. */
export function permits(permissions: RepoPermissions | undefined, needs: Need): boolean {
  if (!permissions) return false;
  const write = permissions.push === true || permissions.maintain === true || permissions.admin === true;
  if (needs === "write") return write;
  return write || permissions.pull === true || permissions.triage === true;
}

function classify(response: Response): GitHubFailure {
  if (response.status === 401) return "token_dead";
  if (response.status === 403) {
    // A rate limit is GitHub being busy, not the person losing access.
    if (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")) {
      return "unavailable";
    }
    return "access_gone";
  }
  if (response.status === 404) return "access_gone";
  return "unavailable";
}

async function userGet(
  userToken: string,
  path: string,
  query: Record<string, string>
): Promise<{ ok: true; body: unknown } | { ok: false; failure: GitHubFailure }> {
  try {
    const response = await fetch(`${GITHUB_API}${path}?${new URLSearchParams(query)}`, {
      headers: { ...GITHUB_HEADERS, Authorization: `Bearer ${userToken}` },
      cache: "no-store",
    });
    if (!response.ok) return { ok: false, failure: classify(response) };
    return { ok: true, body: await response.json() };
  } catch (err) {
    logApiError("github:user-call", err, { path });
    return { ok: false, failure: "unavailable" };
  }
}

const PER_PAGE = 100;
const MAX_INSTALLATION_PAGES = 10;
/** 3,000 repositories per installation. Past that a lookup refuses rather
 *  than guess; a listing returns the first 3,000. */
const MAX_REPO_PAGES = 30;

/** The App installations this person's own token can reach. */
export async function listUserInstallations(userToken: string): Promise<Answer<UserInstallation[]>> {
  const out: UserInstallation[] = [];
  for (let page = 1; page <= MAX_INSTALLATION_PAGES; page++) {
    const res = await userGet(userToken, "/user/installations", { per_page: String(PER_PAGE), page: String(page) });
    if (!res.ok) return res;
    const batch = (res.body as { installations?: Array<{ id?: unknown; account?: { login?: unknown } }> }).installations;
    if (!Array.isArray(batch)) return { ok: false, failure: "unavailable" };
    for (const i of batch) {
      if (typeof i.id === "number" && typeof i.account?.login === "string") {
        out.push({ id: i.id, account: i.account.login });
      }
    }
    if (batch.length < PER_PAGE) break;
  }
  return { ok: true, value: out };
}

function toUserRepo(r: {
  id?: unknown;
  full_name?: unknown;
  name?: unknown;
  owner?: { login?: unknown };
  private?: unknown;
  default_branch?: unknown;
  permissions?: RepoPermissions;
}): UserRepo | null {
  if (typeof r.id !== "number" || typeof r.full_name !== "string" || typeof r.name !== "string") return null;
  if (typeof r.owner?.login !== "string") return null;
  return {
    id: r.id,
    owner: r.owner.login,
    name: r.name,
    fullName: r.full_name,
    private: r.private === true,
    defaultBranch: typeof r.default_branch === "string" ? r.default_branch : "main",
    permissions: r.permissions ?? {},
  };
}

/**
 * The repositories of one installation this person has explicit access to,
 * with their permissions — GitHub's own answer for this token. With `want`,
 * stops at the page that lists it.
 */
export async function listUserInstallationRepos(
  userToken: string,
  installationId: number,
  want?: string
): Promise<Answer<{ repos: UserRepo[]; found: UserRepo | null; complete: boolean }>> {
  const repos: UserRepo[] = [];
  const target = want?.toLowerCase();
  for (let page = 1; page <= MAX_REPO_PAGES; page++) {
    const res = await userGet(userToken, `/user/installations/${installationId}/repositories`, {
      per_page: String(PER_PAGE),
      page: String(page),
    });
    if (!res.ok) return res;
    const batch = (res.body as { repositories?: unknown[] }).repositories;
    if (!Array.isArray(batch)) return { ok: false, failure: "unavailable" };
    for (const raw of batch) {
      const repo = toUserRepo(raw as Parameters<typeof toUserRepo>[0]);
      if (!repo) continue;
      repos.push(repo);
      if (target && repo.fullName.toLowerCase() === target) {
        return { ok: true, value: { repos, found: repo, complete: true } };
      }
    }
    if (batch.length < PER_PAGE) return { ok: true, value: { repos, found: null, complete: true } };
  }
  return { ok: true, value: { repos, found: null, complete: false } };
}

function refusalFor(failure: GitHubFailure): Refusal {
  if (failure === "token_dead") return { status: 403, reason: "reconnect", connection: "expired" };
  if (failure === "access_gone") return { status: 403, reason: "reconnect", connection: "revoked" };
  return { status: 502, reason: "github_unavailable" };
}

/**
 * The one way to a repository token. Checks, then mints — and mints only
 * for the repository GitHub listed for this person, with only the
 * permissions `operation` needs.
 */
export async function grantRepoOperation(
  userToken: string,
  owner: string,
  name: string,
  operation: GitHubOperation
): Promise<{ ok: true; grant: RepoGrant } | { ok: false; refusal: Refusal }> {
  // Own keys only: "constructor" is truthy on every object literal.
  if (!Object.prototype.hasOwnProperty.call(GITHUB_OPERATIONS, operation)) {
    return { ok: false, refusal: { status: 400, reason: "unknown_operation" } };
  }
  const spec = GITHUB_OPERATIONS[operation];

  const installations = await listUserInstallations(userToken);
  if (!installations.ok) return { ok: false, refusal: refusalFor(installations.failure) };
  const installation = installations.value.find((i) => i.account.toLowerCase() === owner.toLowerCase());
  if (!installation) return { ok: false, refusal: { status: 404, reason: "repo_not_found" } };

  const listing = await listUserInstallationRepos(userToken, installation.id, `${owner}/${name}`);
  if (!listing.ok) return { ok: false, refusal: refusalFor(listing.failure) };
  const repo = listing.value.found;
  if (!repo) return { ok: false, refusal: { status: 404, reason: "repo_not_found" } };

  if (!permits(repo.permissions, spec.needs)) {
    return {
      ok: false,
      refusal: spec.needs === "write" ? { status: 403, reason: "read_only" } : { status: 404, reason: "repo_not_found" },
    };
  }

  const token = await createRepoScopedToken(installation.id, repo.id, spec.permissions);
  if (!token) return { ok: false, refusal: { status: 502, reason: "github_unavailable" } };

  const grant: RepoGrant = Object.freeze({
    operation,
    installationId: installation.id,
    repositoryId: repo.id,
    owner: repo.owner,
    name: repo.name,
    fullName: repo.fullName,
    defaultBranch: repo.defaultBranch,
    headers: Object.freeze({ ...GITHUB_HEADERS, Authorization: `Bearer ${token.token}` }),
  });
  ISSUED_GRANTS.add(grant);
  return { ok: true, grant };
}

/** Every repository this person can see in any installation they can
 *  reach, through their own token — the repository picker's list. */
export async function listVisibleRepos(
  userToken: string
): Promise<{ ok: true; repos: UserRepo[]; installations: number } | { ok: false; refusal: Refusal }> {
  const installations = await listUserInstallations(userToken);
  if (!installations.ok) return { ok: false, refusal: refusalFor(installations.failure) };
  const repos: UserRepo[] = [];
  for (const installation of installations.value) {
    const listing = await listUserInstallationRepos(userToken, installation.id);
    if (!listing.ok) {
      // A dead token is the connection's problem; one installation the
      // person just lost is not shown, and the others still are.
      if (listing.failure === "token_dead") return { ok: false, refusal: refusalFor(listing.failure) };
      if (listing.failure === "unavailable") return { ok: false, refusal: refusalFor(listing.failure) };
      continue;
    }
    repos.push(...listing.value.repos);
  }
  return { ok: true, repos, installations: installations.value.length };
}
