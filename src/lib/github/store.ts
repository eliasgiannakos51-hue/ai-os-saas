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
    installationId: row.installation_id,
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

export async function getGitHubAccessToken(
  userId: string
): Promise<{ ok: true; token: string; installationId: number | null } | { ok: false; reason: string }> {
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
  if (row.status === "revoked") return { ok: false, reason: "revoked" };

  try {
    const token = decryptSecret(
      row.access_token_encrypted,
      tokenContext(userId, "github", "access")
    );
    return { ok: true, token, installationId: row.installation_id };
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
  installationId: number | null;
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
      installation_id: params.installationId,
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

export async function updateInstallationId(
  userId: string,
  installationId: number
): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("github_connections")
    .update({ installation_id: installationId })
    .eq("user_id", userId);
  if (error) {
    logApiError("github:update-installation", error, { userId });
    return false;
  }
  return true;
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
