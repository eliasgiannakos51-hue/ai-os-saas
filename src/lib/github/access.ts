import "server-only";
import { getGitHubAccessToken, markGitHubConnectionStatus } from "@/lib/github/store";
import {
  grantRepoOperation,
  listVisibleRepos,
  type GitHubOperation,
  type RepoGrant,
  type Refusal,
  type UserRepo,
} from "@/lib/github/permission";
import { parseRepoFullName } from "@/lib/github/validate";

// The half of the per-request repository check that needs the database
// (SECURITY-AUDIT ΑΣ-1.15): read the signed-in person's own GitHub token,
// hand it to lib/github/permission.ts, and when GitHub says the connection
// no longer works, mark the row so the Coding screen offers Connect again.
//
// Every route under src/app/api/github/ that names a repository calls
// authorizeRepoOperation before it does anything else with it, and
// scripts/tests/github-security.test.mjs holds every one of them to that.

export type GitHubRefused = { ok: false; status: number; reason: string };

export type RepoAuthorization = { ok: true; grant: RepoGrant } | GitHubRefused;

async function refuse(userId: string, refusal: Refusal): Promise<GitHubRefused> {
  if (refusal.connection) await markGitHubConnectionStatus(userId, refusal.connection);
  return { ok: false, status: refusal.status, reason: refusal.reason };
}

/** May this signed-in person perform `operation` on the repository the
 *  request names? Yes comes with a grant whose token reaches only it. */
export async function authorizeRepoOperation(
  userId: string,
  repoParam: unknown,
  operation: GitHubOperation
): Promise<RepoAuthorization> {
  const target = parseRepoFullName(repoParam);
  if (!target) return { ok: false, status: 400, reason: "invalid_repo" };

  const token = await getGitHubAccessToken(userId);
  if (!token.ok) {
    return { ok: false, status: 403, reason: token.reason === "not_connected" ? "not_connected" : "reconnect" };
  }

  const result = await grantRepoOperation(token.token, target.owner, target.name, operation);
  if (!result.ok) return refuse(userId, result.refusal);
  return { ok: true, grant: result.grant };
}

/** The repositories this signed-in person can see, through their own token. */
export async function visibleReposFor(
  userId: string
): Promise<{ ok: true; repos: UserRepo[]; installations: number } | GitHubRefused> {
  const token = await getGitHubAccessToken(userId);
  if (!token.ok) {
    return { ok: false, status: 403, reason: token.reason === "not_connected" ? "not_connected" : "reconnect" };
  }
  const result = await listVisibleRepos(token.token);
  if (!result.ok) return refuse(userId, result.refusal);
  return result;
}
