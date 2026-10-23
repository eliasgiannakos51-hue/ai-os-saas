import "server-only";
import { createSign } from "node:crypto";
import { logApiError } from "@/lib/log-error";

// GitHub App authentication.
//
// Two layers, serving different purposes:
//   1. The OAuth user access token (stored encrypted in github_connections)
//      identifies the PERSON — it lists their installations and their own
//      repos. It is long-lived and refreshed by GitHub automatically.
//   2. The installation access token (generated here on demand, NEVER stored)
//      gives access to the REPOSITORIES the person granted. It expires in
//      one hour and is cheap to mint — just a JWT signature and one POST.
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

export async function createInstallationToken(
  installationId: number
): Promise<InstallationToken | null> {
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
        },
        cache: "no-store",
      }
    );
    if (!response.ok) {
      logApiError("github:installation-token", new Error(`${response.status}`), {
        installationId,
      });
      return null;
    }
    const body = (await response.json()) as { token?: string; expires_at?: string };
    if (!body.token) return null;
    return {
      token: body.token,
      expiresAt: new Date(body.expires_at ?? Date.now() + 3_500_000),
    };
  } catch (err) {
    logApiError("github:installation-token", err, { installationId });
    return null;
  }
}

// Lists installations accessible to a user via their OAuth access token.
export async function listUserInstallations(
  userAccessToken: string
): Promise<Array<{ id: number; account: { login: string }; repositorySelection: string }>> {
  try {
    const response = await fetch(
      "https://api.github.com/user/installations?per_page=100",
      {
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      }
    );
    if (!response.ok) return [];
    const body = (await response.json()) as {
      installations?: Array<{
        id: number;
        account: { login: string };
        repository_selection: string;
      }>;
    };
    return (body.installations ?? []).map((i) => ({
      id: i.id,
      account: { login: i.account.login },
      repositorySelection: i.repository_selection,
    }));
  } catch {
    return [];
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
