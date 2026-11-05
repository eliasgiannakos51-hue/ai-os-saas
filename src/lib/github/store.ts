import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import {
  encryptSecret,
  decryptSecret,
  tokenContext,
  safeErrorDetail,
} from "@/lib/integrations/crypto";
import type { GitHubConnectionSummary, GitHubConnectionStatus } from "@/lib/github/types";

// THE installation_id COLUMN IS NO LONGER AN INPUT TO ANYTHING (2026-11-05,
// SECURITY-AUDIT ΑΣ-1.15). It held the first installation the person could
// reach at connect time, and every repository operation acted through it —
// which is how a member of an organisation could act on repositories they
// had no access to, and kept that reach after being removed. The
// installation is now resolved per request from the person's own token
// (lib/github/permission.ts). saveGitHubConnection writes the column as
// null, so a reconnect also clears a value an earlier build stored, and
// nothing reads it.

type ConnectionRow = {
  id: string;
  user_id: string;
  github_user_id: number;
  github_login: string;
  access_token_encrypted: string;
  installation_id: number | null;
  connected_at: string;
  status: GitHubConnectionStatus;
};

function summarise(row: ConnectionRow): GitHubConnectionSummary {
  return {
    login: row.github_login,
    status: row.status,
    connectedAt: row.connected_at,
  };
}

export async function getGitHubConnection(
  userId: string
): Promise<GitHubConnectionSummary | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("github_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    logApiError("github:get-connection", error, { userId });
    return null;
  }
  if (!data) return null;
  return summarise(data as ConnectionRow);
}

/** The person's own GitHub token — only for a connection that still works.
 *  An expired, revoked or undecryptable one answers "reconnect". */
export async function getGitHubAccessToken(
  userId: string
): Promise<{ ok: true; token: string } | { ok: false; reason: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("github_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    logApiError("github:get-token", error, { userId });
    return { ok: false, reason: "error" };
  }
  if (!data) return { ok: false, reason: "not_connected" };

  const row = data as ConnectionRow;
  if (row.status !== "connected") return { ok: false, reason: "reconnect" };

  try {
    const token = decryptSecret(
      row.access_token_encrypted,
      tokenContext(userId, "github", "access")
    );
    return { ok: true, token };
  } catch (err) {
    logApiError("github:decrypt", safeErrorDetail(err), { userId });
    await markStatus(row.id, "error");
    return { ok: false, reason: "undecryptable" };
  }
}

export async function saveGitHubConnection(params: {
  userId: string;
  githubUserId: number;
  githubLogin: string;
  accessToken: string;
}): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  try {
    const admin = createAdminClient();
    const row = {
      user_id: params.userId,
      github_user_id: params.githubUserId,
      github_login: params.githubLogin,
      access_token_encrypted: encryptSecret(
        params.accessToken,
        tokenContext(params.userId, "github", "access")
      ),
      installation_id: null,
      connected_at: new Date().toISOString(),
      status: "connected" as const,
    };

    const { data, error } = await admin
      .from("github_connections")
      .upsert(row, { onConflict: "user_id" })
      .select("id")
      .single();

    if (error || !data) {
      logApiError("github:save", error, { userId: params.userId });
      return { ok: false, reason: "save_failed" };
    }
    return { ok: true, id: String(data.id) };
  } catch (err) {
    logApiError("github:save", safeErrorDetail(err), {
      userId: params.userId,
      stage: "encrypt",
    });
    return { ok: false, reason: "encryption_unavailable" };
  }
}

/** Marks the person's connection as needing a reconnect: their token was
 *  refused (expired) or their access to the installation is gone (revoked).
 *  The status route then reports it as not connected. */
export async function markGitHubConnectionStatus(
  userId: string,
  status: Exclude<GitHubConnectionStatus, "connected">
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("github_connections")
      .update({ status })
      .eq("user_id", userId);
    if (error) logApiError("github:mark-status", error, { userId, status });
  } catch (err) {
    logApiError("github:mark-status", err, { userId, status });
  }
}

export async function disconnectGitHub(
  userId: string
): Promise<{ ok: boolean }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("github_connections")
    .delete()
    .eq("user_id", userId);
  if (error) {
    logApiError("github:disconnect", error, { userId });
    return { ok: false };
  }
  return { ok: true };
}

async function markStatus(id: string, status: GitHubConnectionStatus): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("github_connections").update({ status }).eq("id", id);
  } catch (err) {
    logApiError("github:status", err, { id, status });
  }
}
