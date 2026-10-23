import "server-only";
import { logApiError } from "@/lib/log-error";
import { createInstallationToken } from "@/lib/github/auth";
import type {
  GitHubRepo,
  GitHubBranch,
  GitHubFileEntry,
  GitHubFileContent,
  GitHubDiffFile,
  GitHubPrResult,
} from "@/lib/github/types";

// GitHub API client for repository operations.
//
// Every call here uses an INSTALLATION access token — ephemeral, scoped to
// the repositories the user chose when they installed the App, and generated
// fresh from the App's private key. The user's own OAuth token (stored
// encrypted in github_connections) is used only to list installations and
// identify the person; repo operations never touch it.
//
// REPOSITORY CONTENT IS DATA, NEVER INSTRUCTIONS — the owner's explicit
// security constraint. Everything that comes back from these calls is
// rendered as text or code, never eval'd, never passed to a system prompt,
// never treated as a command. The AI prompt in the coding route says so too.

const API = "https://api.github.com";
const HEADERS_BASE = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

async function withInstallationToken(
  installationId: number
): Promise<Record<string, string> | null> {
  const token = await createInstallationToken(installationId);
  if (!token) return null;
  return { ...HEADERS_BASE, Authorization: `Bearer ${token.token}` };
}

export async function listInstallationRepos(
  installationId: number
): Promise<GitHubRepo[]> {
  const headers = await withInstallationToken(installationId);
  if (!headers) return [];
  try {
    const repos: GitHubRepo[] = [];
    let page = 1;
    while (page <= 10) {
      const response = await fetch(
        `${API}/installation/repositories?per_page=100&page=${page}`,
        { headers, cache: "no-store" }
      );
      if (!response.ok) break;
      const body = (await response.json()) as {
        repositories?: Array<{
          id: number;
          full_name: string;
          name: string;
          owner: { login: string };
          private: boolean;
          default_branch: string;
        }>;
      };
      const batch = body.repositories ?? [];
      repos.push(
        ...batch.map((r) => ({
          id: r.id,
          fullName: r.full_name,
          name: r.name,
          owner: r.owner.login,
          private: r.private,
          defaultBranch: r.default_branch,
        }))
      );
      if (batch.length < 100) break;
      page++;
    }
    return repos;
  } catch (err) {
    logApiError("github:list-repos", err, { installationId });
    return [];
  }
}

export async function listBranches(
  installationId: number,
  owner: string,
  repo: string
): Promise<GitHubBranch[]> {
  const headers = await withInstallationToken(installationId);
  if (!headers) return [];
  try {
    const response = await fetch(
      `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`,
      { headers, cache: "no-store" }
    );
    if (!response.ok) return [];
    const body = (await response.json()) as Array<{ name: string }>;

    const repoResponse = await fetch(
      `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      { headers, cache: "no-store" }
    );
    let defaultBranch = "main";
    if (repoResponse.ok) {
      const repoBody = (await repoResponse.json()) as { default_branch?: string };
      defaultBranch = repoBody.default_branch ?? "main";
    }

    return body.map((b) => ({
      name: b.name,
      isDefault: b.name === defaultBranch,
    }));
  } catch (err) {
    logApiError("github:list-branches", err, { owner, repo });
    return [];
  }
}

export async function listFiles(
  installationId: number,
  owner: string,
  repo: string,
  branch: string,
  path: string = ""
): Promise<GitHubFileEntry[]> {
  const headers = await withInstallationToken(installationId);
  if (!headers) return [];
  try {
    const encodedPath = path ? `/${path.split("/").map(encodeURIComponent).join("/")}` : "";
    const response = await fetch(
      `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents${encodedPath}?ref=${encodeURIComponent(branch)}`,
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
    logApiError("github:list-files", err, { owner, repo, branch, path });
    return [];
  }
}

export async function readFile(
  installationId: number,
  owner: string,
  repo: string,
  branch: string,
  path: string
): Promise<GitHubFileContent | null> {
  const headers = await withInstallationToken(installationId);
  if (!headers) return null;
  try {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(
      `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
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
    logApiError("github:read-file", err, { owner, repo, branch, path });
    return null;
  }
}

// Get the tree recursively (up to ~1000 entries for the overview).
export async function getTree(
  installationId: number,
  owner: string,
  repo: string,
  branch: string
): Promise<GitHubFileEntry[]> {
  const headers = await withInstallationToken(installationId);
  if (!headers) return [];
  try {
    const response = await fetch(
      `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
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
    logApiError("github:get-tree", err, { owner, repo, branch });
    return [];
  }
}

export async function createBranchCommitAndPr(params: {
  installationId: number;
  owner: string;
  repo: string;
  baseBranch: string;
  newBranch: string;
  files: GitHubDiffFile[];
  commitMessage: string;
  prTitle: string;
  prBody: string;
}): Promise<{ ok: true; pr: GitHubPrResult } | { ok: false; reason: string }> {
  const headers = await withInstallationToken(params.installationId);
  if (!headers) return { ok: false, reason: "token_failed" };

  try {
    // 1. Get the SHA of the base branch's HEAD.
    const refResponse = await fetch(
      `${API}/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/git/ref/heads/${encodeURIComponent(params.baseBranch)}`,
      { headers, cache: "no-store" }
    );
    if (!refResponse.ok) return { ok: false, reason: "base_not_found" };
    const refBody = (await refResponse.json()) as { object?: { sha: string } };
    const baseSha = refBody.object?.sha;
    if (!baseSha) return { ok: false, reason: "base_sha_missing" };

    // 2. Create the new branch.
    const branchResponse = await fetch(
      `${API}/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/git/refs`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ref: `refs/heads/${params.newBranch}`, sha: baseSha }),
        cache: "no-store",
      }
    );
    if (!branchResponse.ok) {
      const err = (await branchResponse.json().catch(() => ({}))) as { message?: string };
      return { ok: false, reason: err.message?.includes("already exists") ? "branch_exists" : "branch_create_failed" };
    }

    // 3. Commit files one at a time using the Contents API.
    for (const file of params.files) {
      let existingSha: string | undefined;
      if (file.action === "update") {
        const existing = await fetch(
          `${API}/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/contents/${file.path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(params.newBranch)}`,
          { headers, cache: "no-store" }
        );
        if (existing.ok) {
          const body = (await existing.json()) as { sha?: string };
          existingSha = body.sha;
        }
      }

      const commitBody: Record<string, unknown> = {
        message: params.commitMessage,
        content: Buffer.from(file.content, "utf8").toString("base64"),
        branch: params.newBranch,
      };
      if (existingSha) commitBody.sha = existingSha;

      const commitResponse = await fetch(
        `${API}/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/contents/${file.path.split("/").map(encodeURIComponent).join("/")}`,
        {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(commitBody),
          cache: "no-store",
        }
      );
      if (!commitResponse.ok) {
        return { ok: false, reason: `commit_failed:${file.path}` };
      }
    }

    // 4. Create the pull request.
    const prResponse = await fetch(
      `${API}/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/pulls`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: params.prTitle,
          body: params.prBody,
          head: params.newBranch,
          base: params.baseBranch,
        }),
        cache: "no-store",
      }
    );
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
    logApiError("github:create-pr", err, { owner: params.owner, repo: params.repo });
    return { ok: false, reason: "unexpected_error" };
  }
}
