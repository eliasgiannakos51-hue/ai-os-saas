import "server-only";
import { createSign } from "node:crypto";
import { logApiError } from "@/lib/log-error";

// GitHub App authentication.
//
// Two layers, serving different purposes:
//   1. The OAuth user access token (stored encrypted in github_connections)
//      identifies the PERSON. lib/github/permission.ts asks GitHub, with it,
//      which installations and repositories this person can reach and with
//      what permissions — before every repository operation. It lasts until
//      revoked only when the App opts out of token expiry; with expiry on
//      (GitHub's default) it lasts eight hours, the next call after that is
//      refused with 401, and the connection is marked "expired" so the
//      Coding screen offers Connect again (docs/NEEDS-FROM-ELIAS.md, 11).
//   2. The installation access token (minted here on demand, NEVER stored)
//      does the work. It is minted only by createRepoScopedToken: for ONE
//      repository id and only the permissions one operation needs, and only
//      after permission.ts has checked the person (SECURITY-AUDIT ΑΣ-1.15).
//      There is no installation-wide token anywhere in this codebase.
//
// The App's private key never leaves this file. It arrives base64-encoded
// from GITHUB_APP_PRIVATE_KEY (Vercel encodes PEM files this way because
// multiline values in env vars are fragile across shells, Docker layers and
// secret managers) and is decoded once at first use.

let cachedPem: string | null = null;

function loadPrivateKey(): string {
  if (cachedPem) return cachedPem;
  const raw = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!raw) throw new Error("GITHUB_APP_PRIVATE_KEY is not configured.");
  if (raw.startsWith("-----BEGIN")) {
    cachedPem = raw;
  } else {
    cachedPem = Buffer.from(raw, "base64").toString("utf8");
  }
  if (!cachedPem.includes("-----BEGIN")) {
    throw new Error("GITHUB_APP_PRIVATE_KEY is not a valid PEM key.");
  }
  return cachedPem;
}

function appId(): string {
  const id = process.env.GITHUB_APP_ID?.trim();
  if (!id) throw new Error("GITHUB_APP_ID is not configured.");
  return id;
}

export function githubAppConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_APP_ID?.trim() &&
    process.env.GITHUB_APP_PRIVATE_KEY?.trim() &&
    process.env.GITHUB_APP_CLIENT_ID?.trim() &&
    process.env.GITHUB_APP_CLIENT_SECRET?.trim()
  );
}

function base64url(data: string): string {
  return Buffer.from(data, "utf8").toString("base64url");
}

// RS256 JWT, valid for 10 minutes (GitHub's maximum).
export function createAppJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ iat: now - 60, exp: now + 600, iss: appId() })
  );
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .sign(loadPrivateKey(), "base64url");
  return `${header}.${payload}.${signature}`;
}

export type InstallationToken = {
  token: string;
  expiresAt: Date;
};

/** The installation-token permissions an operation may ask for. */
export type RepoTokenPermissions = Readonly<
  Partial<Record<"metadata" | "contents" | "pull_requests" | "checks", "read" | "write">>
>;

const PERMISSION_RANK = { read: 1, write: 2 } as const;

/**
 * An installation token that can reach ONE repository, with only
 * `permissions`. Both are always sent: without `repository_ids` GitHub
 * scopes the token to every repository of the installation, and without
 * `permissions` to everything the App was granted.
 *
 * What GitHub hands back is checked too, and anything wider than asked for
 * is refused rather than used.
 */
export async function createRepoScopedToken(
  installationId: number,
  repositoryId: number,
  permissions: RepoTokenPermissions
): Promise<InstallationToken | null> {
  if (!Number.isSafeInteger(installationId) || installationId <= 0) return null;
  if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0) return null;
  if (Object.keys(permissions).length === 0) return null;
  try {
    const jwt = createAppJwt();
    const response = await fetch(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ repository_ids: [repositoryId], permissions }),
        cache: "no-store",
      }
    );
    if (!response.ok) {
      logApiError("github:installation-token", new Error(`${response.status}`), {
        installationId,
        repositoryId,
      });
      return null;
    }
    const body = (await response.json()) as {
      token?: string;
      expires_at?: string;
      repository_selection?: string;
      repositories?: Array<{ id?: number }>;
      permissions?: Record<string, string>;
    };
    if (!body.token) return null;
    const wider =
      (body.repository_selection !== undefined && body.repository_selection !== "selected") ||
      (Array.isArray(body.repositories) && body.repositories.some((r) => r.id !== repositoryId)) ||
      Object.entries(body.permissions ?? {}).some(([key, level]) => {
        const asked = permissions[key as keyof RepoTokenPermissions];
        const got = PERMISSION_RANK[level as keyof typeof PERMISSION_RANK] ?? 3;
        return !asked || got > PERMISSION_RANK[asked];
      });
    if (wider) {
      logApiError("github:installation-token", new Error("token wider than requested"), {
        installationId,
        repositoryId,
      });
      return null;
    }
    return {
      token: body.token,
      expiresAt: new Date(body.expires_at ?? Date.now() + 3_500_000),
    };
  } catch (err) {
    logApiError("github:installation-token", err, { installationId, repositoryId });
    return null;
  }
}

export async function getGitHubUser(
  accessToken: string
): Promise<{ id: number; login: string } | null> {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { id?: number; login?: string };
    if (!body.id || !body.login) return null;
    return { id: body.id, login: body.login };
  } catch {
    return null;
  }
}
