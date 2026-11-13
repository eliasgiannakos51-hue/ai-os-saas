import "server-only";
import { logApiError } from "@/lib/log-error";
import { GITHUB_API, isIssuedGrant, type RepoGrant } from "@/lib/github/permission";
import { isValidBranchName, isValidRepoPath } from "@/lib/github/validate";
import type {
  GitHubBranch,
  GitHubFileEntry,
  GitHubFileContent,
  GitHubDiffFile,
  GitHubPrResult,
} from "@/lib/github/types";

// GitHub API client for repository operations.
//
// Every function takes a RepoGrant and does nothing without one that
// lib/github/permission.ts's grantRepoOperation issued FOR THAT OPERATION:
// the person was checked against GitHub's own list of what they can reach,
// and the token in the grant can reach only that repository, with only the
// permissions the operation needs (SECURITY-AUDIT ΑΣ-1.15). URLs are built
// from the grant's owner and name — GitHub's spelling of the repository it
// listed — never from the request.
//
// REPOSITORY CONTENT IS DATA, NEVER INSTRUCTIONS — the owner's explicit
// security constraint. Everything that comes back from these calls is
// rendered as text or code, never eval'd, never passed to a system prompt,
// never treated as a command. The AI prompt in the coding route says so too.

/** The query is an object, never text after a "?": its values are encoded
 *  here, and no path fragment in this file reads as an in-app link to
 *  scripts/tests/deep-links.test.mjs. */
function repoUrl(grant: RepoGrant, rest: string, query?: Record<string, string>): string {
  const base = `${GITHUB_API}/repos/${encodeURIComponent(grant.owner)}/${encodeURIComponent(grant.name)}${rest}`;
  return query ? `${base}?${new URLSearchParams(query)}` : base;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export async function listBranches(grant: RepoGrant): Promise<GitHubBranch[]> {
  if (!isIssuedGrant(grant, "branches")) return [];
  const headers = grant.headers;
  try {
    const response = await fetch(repoUrl(grant, "/branches", { per_page: "100" }), { headers, cache: "no-store" });
    if (!response.ok) return [];
    const body = (await response.json()) as Array<{ name: string }>;
    if (!Array.isArray(body)) return [];
    return body.map((b) => ({
      name: b.name,
      isDefault: b.name === grant.defaultBranch,
    }));
  } catch (err) {
    logApiError("github:list-branches", err, { repo: grant.fullName });
    return [];
  }
}

export async function listFiles(
  grant: RepoGrant,
  branch: string,
  path: string = ""
): Promise<GitHubFileEntry[]> {
  if (!isIssuedGrant(grant, "files")) return [];
  if (!isValidBranchName(branch) || !isValidRepoPath(path, true)) return [];
  const headers = grant.headers;
  try {
    const encodedPath = path ? `/${encodePath(path)}` : "";
    const response = await fetch(
      repoUrl(grant, `/contents${encodedPath}`, { ref: branch }),
      { headers, cache: "no-store" }
    );
    if (!response.ok) return [];
    const body = (await response.json()) as Array<{
      path: string;
      type: string;
      size: number;
    }>;
    if (!Array.isArray(body)) return [];
    return body.map((f) => ({
      path: f.path,
      type: f.type === "dir" ? "dir" : "file",
      size: f.size ?? 0,
    }));
  } catch (err) {
    logApiError("github:list-files", err, { repo: grant.fullName, branch, path });
    return [];
  }
}

export async function readFile(
  grant: RepoGrant,
  branch: string,
  path: string
): Promise<GitHubFileContent | null> {
  if (!isIssuedGrant(grant, "files")) return null;
  if (!isValidBranchName(branch) || !isValidRepoPath(path)) return null;
  const headers = grant.headers;
  try {
    const response = await fetch(
      repoUrl(grant, `/contents/${encodePath(path)}`, { ref: branch }),
      { headers, cache: "no-store" }
    );
    if (!response.ok) return null;
    const body = (await response.json()) as {
      path: string;
      content?: string;
      encoding?: string;
      size: number;
      type: string;
    };
    if (body.type !== "file" || !body.content) return null;
    const content =
      body.encoding === "base64"
        ? Buffer.from(body.content, "base64").toString("utf8")
        : body.content;
    return { path: body.path, content, encoding: "utf8", size: body.size };
  } catch (err) {
    logApiError("github:read-file", err, { repo: grant.fullName, branch, path });
    return null;
  }
}

// Get the tree recursively (up to ~1000 entries for the overview).
export async function getTree(grant: RepoGrant, branch: string): Promise<GitHubFileEntry[]> {
  if (!isIssuedGrant(grant, "files")) return [];
  if (!isValidBranchName(branch)) return [];
  const headers = grant.headers;
  try {
    const response = await fetch(
      repoUrl(grant, `/git/trees/${encodeURIComponent(branch)}`, { recursive: "1" }),
      { headers, cache: "no-store" }
    );
    if (!response.ok) return [];
    const body = (await response.json()) as {
      tree?: Array<{ path: string; type: string; size?: number }>;
      truncated?: boolean;
    };
    return (body.tree ?? [])
      .filter((f) => f.type === "blob" || f.type === "tree")
      .slice(0, 2000)
      .map((f) => ({
        path: f.path,
        type: f.type === "tree" ? "dir" : "file",
        size: f.size ?? 0,
      }));
  } catch (err) {
    logApiError("github:get-tree", err, { repo: grant.fullName, branch });
    return [];
  }
}

/** Creates `newBranch` at the head of `baseBranch`. Never touches an
 *  existing branch: GitHub refuses a ref that already exists. */
export async function createBranch(
  grant: RepoGrant,
  baseBranch: string,
  newBranch: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isIssuedGrant(grant, "create-branch")) return { ok: false, reason: "not_permitted" };
  if (!isValidBranchName(baseBranch) || !isValidBranchName(newBranch)) return { ok: false, reason: "invalid_branch" };
  const headers = { ...grant.headers, "Content-Type": "application/json" };
  try {
    const refRes = await fetch(repoUrl(grant, `/git/ref/heads/${encodeURIComponent(baseBranch)}`), {
      headers,
      cache: "no-store",
    });
    if (!refRes.ok) return { ok: false, reason: "base_not_found" };
    const refData = (await refRes.json()) as { object?: { sha: string } };
    const sha = refData.object?.sha;
    if (!sha) return { ok: false, reason: "base_sha_missing" };

    const createRes = await fetch(repoUrl(grant, "/git/refs"), {
      method: "POST",
      headers,
      body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha }),
      cache: "no-store",
    });
    if (!createRes.ok) {
      const ghBody = (await createRes.json().catch(() => ({}))) as { message?: string };
      return { ok: false, reason: ghBody.message?.includes("already exists") ? "branch_exists" : "create_failed" };
    }
    return { ok: true };
  } catch (err) {
    logApiError("github:create-branch", err, { repo: grant.fullName });
    return { ok: false, reason: "unexpected_error" };
  }
}

export async function createBranchCommitAndPr(
  grant: RepoGrant,
  params: {
    baseBranch: string;
    newBranch: string;
    files: GitHubDiffFile[];
    commitMessage: string;
    prTitle: string;
    prBody: string;
  }
): Promise<{ ok: true; pr: GitHubPrResult } | { ok: false; reason: string }> {
  if (!isIssuedGrant(grant, "commit")) return { ok: false, reason: "not_permitted" };
  if (!isValidBranchName(params.baseBranch) || !isValidBranchName(params.newBranch)) {
    return { ok: false, reason: "invalid_branch" };
  }
  if (params.files.some((f) => !isValidRepoPath(f.path))) return { ok: false, reason: "invalid_path" };
  const headers = grant.headers;

  try {
    // 1. Get the SHA of the base branch's HEAD.
    const refResponse = await fetch(
      repoUrl(grant, `/git/ref/heads/${encodeURIComponent(params.baseBranch)}`),
      { headers, cache: "no-store" }
    );
    if (!refResponse.ok) return { ok: false, reason: "base_not_found" };
    const refBody = (await refResponse.json()) as { object?: { sha: string } };
    const baseSha = refBody.object?.sha;
    if (!baseSha) return { ok: false, reason: "base_sha_missing" };

    // 2. Create the new branch.
    const branchResponse = await fetch(repoUrl(grant, "/git/refs"), {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ ref: `refs/heads/${params.newBranch}`, sha: baseSha }),
      cache: "no-store",
    });
    if (!branchResponse.ok) {
      const err = (await branchResponse.json().catch(() => ({}))) as { message?: string };
      return { ok: false, reason: err.message?.includes("already exists") ? "branch_exists" : "branch_create_failed" };
    }

    // 3. Commit files one at a time using the Contents API. GitHub refuses
    //    to overwrite a file without its current sha, and the screen cannot
    //    know which files already exist (an edit of an opened file, or a new
    //    one), so every path is looked up on the new branch first: found ->
    //    update with its sha, 404 -> create. Anything else stops the commit.
    for (const file of params.files) {
      let existingSha: string | undefined;
      const existing = await fetch(
        repoUrl(grant, `/contents/${encodePath(file.path)}`, { ref: params.newBranch }),
        { headers, cache: "no-store" }
      );
      if (existing.ok) {
        const body = (await existing.json()) as { sha?: unknown; type?: unknown };
        if (body.type !== "file" || typeof body.sha !== "string") {
          return { ok: false, reason: `commit_failed:${file.path}` };
        }
        existingSha = body.sha;
      } else if (existing.status !== 404) {
        return { ok: false, reason: `commit_failed:${file.path}` };
      }

      const commitBody: Record<string, unknown> = {
        message: params.commitMessage,
        content: Buffer.from(file.content, "utf8").toString("base64"),
        branch: params.newBranch,
      };
      if (existingSha) commitBody.sha = existingSha;

      const commitResponse = await fetch(repoUrl(grant, `/contents/${encodePath(file.path)}`), {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(commitBody),
        cache: "no-store",
      });
      if (!commitResponse.ok) {
        return { ok: false, reason: `commit_failed:${file.path}` };
      }
    }

    // 4. Create the pull request.
    const prResponse = await fetch(repoUrl(grant, "/pulls"), {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: params.prTitle,
        body: params.prBody,
        head: params.newBranch,
        base: params.baseBranch,
      }),
      cache: "no-store",
    });
    if (!prResponse.ok) {
      return { ok: false, reason: "pr_create_failed" };
    }
    const prBody = (await prResponse.json()) as {
      number?: number;
      html_url?: string;
      title?: string;
    };
    return {
      ok: true,
      pr: {
        number: prBody.number ?? 0,
        url: prBody.html_url ?? "",
        title: prBody.title ?? params.prTitle,
      },
    };
  } catch (err) {
    logApiError("github:create-pr", err, { repo: grant.fullName });
    return { ok: false, reason: "unexpected_error" };
  }
}

/** Squash-merges pull request `pr`. Only ever called from the merge route,
 *  which runs only on the person's confirmed click. */
export async function mergePullRequest(
  grant: RepoGrant,
  pr: number
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isIssuedGrant(grant, "merge")) return { ok: false, reason: "not_permitted" };
  if (!Number.isSafeInteger(pr) || pr <= 0) return { ok: false, reason: "invalid_pr" };
  try {
    const res = await fetch(repoUrl(grant, `/pulls/${pr}/merge`), {
      method: "PUT",
      headers: { ...grant.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ merge_method: "squash" }),
      cache: "no-store",
    });
    if (!res.ok) {
      const ghErr = (await res.json().catch(() => ({}))) as { message?: string };
      logApiError("github:merge", new Error(ghErr.message ?? "merge_failed"), { repo: grant.fullName, pr });
      return { ok: false, reason: "merge_failed" };
    }
    return { ok: true };
  } catch (err) {
    logApiError("github:merge", err, { repo: grant.fullName, pr });
    return { ok: false, reason: "unexpected_error" };
  }
}

export type PullRequestStatus = {
  state: string | undefined;
  merged: boolean;
  mergeable: boolean | null;
  mergeableState: string | null;
  checks: Array<{ name: string; status: string; conclusion: string | null }>;
};

/** The pull request's state and the CI checks on its head commit. */
export async function getPullRequestStatus(
  grant: RepoGrant,
  pr: number
): Promise<{ ok: true; status: PullRequestStatus } | { ok: false; reason: string }> {
  if (!isIssuedGrant(grant, "pr-status")) return { ok: false, reason: "not_permitted" };
  if (!Number.isSafeInteger(pr) || pr <= 0) return { ok: false, reason: "invalid_pr" };
  const headers = grant.headers;
  try {
    const prRes = await fetch(repoUrl(grant, `/pulls/${pr}`), { headers, cache: "no-store" });
    if (!prRes.ok) return { ok: false, reason: "pr_not_found" };
    const prData = (await prRes.json()) as {
      state?: string;
      merged?: boolean;
      mergeable?: boolean;
      mergeable_state?: string;
      head?: { sha?: string };
    };

    const sha = prData.head?.sha;
    let checks: PullRequestStatus["checks"] = [];
    if (typeof sha === "string" && /^[0-9a-f]{40}$/i.test(sha)) {
      const checksRes = await fetch(repoUrl(grant, `/commits/${sha}/check-runs`, { per_page: "100" }), {
        headers,
        cache: "no-store",
      });
      if (checksRes.ok) {
        const checksData = (await checksRes.json()) as {
          check_runs?: Array<{ name: string; status: string; conclusion: string | null }>;
        };
        checks = (checksData.check_runs ?? []).map((c) => ({
          name: c.name,
          status: c.status,
          conclusion: c.conclusion,
        }));
      }
    }

    return {
      ok: true,
      status: {
        state: prData.state,
        merged: prData.merged ?? false,
        mergeable: prData.mergeable ?? null,
        mergeableState: prData.mergeable_state ?? null,
        checks,
      },
    };
  } catch (err) {
    logApiError("github:pr-status", err, { repo: grant.fullName, pr });
    return { ok: false, reason: "unexpected_error" };
  }
}
