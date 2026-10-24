import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { encryptSecret, decryptSecret, tokenContext, safeErrorDetail } from "@/lib/integrations/crypto";
import type { McpServerSummary, McpToolSummary } from "@/lib/mcp/types";

/**
 * Apps connected by address, as the server keeps them. Every read and write
 * here names the caller's user id; no function takes a row id alone, so one
 * person can never reach another's app through this file. The token is
 * encrypted with the person's own binding (tokenContext) and is decrypted
 * only by getMcpServerForUse, for the one call that is about to send it.
 */

const ROW_CAP = 100;

type Row = {
  id: string;
  user_id: string;
  name: string;
  url: string;
  auth_token_encrypted: string | null;
  tools: unknown;
  tools_checked_at: string | null;
  status: "connected" | "error";
  created_at: string;
};

function summarise(row: Row): McpServerSummary {
  let host = "";
  try {
    host = new URL(row.url).host;
  } catch {
    host = "";
  }
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    host,
    tools: Array.isArray(row.tools) ? (row.tools as McpToolSummary[]) : [],
    toolsCheckedAt: row.tools_checked_at,
    status: row.status,
    hasToken: Boolean(row.auth_token_encrypted),
    createdAt: row.created_at,
  };
}

export async function listMcpServers(userId: string): Promise<McpServerSummary[]> {
  const { data, error } = await createAdminClient()
    .from("mcp_servers")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(ROW_CAP);
  if (error) {
    logApiError("mcp:list", error, { userId });
    return [];
  }
  return ((data ?? []) as Row[]).map(summarise);
}

export async function countMcpServers(userId: string): Promise<number> {
  const { count, error } = await createAdminClient().from("mcp_servers").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (error) {
    logApiError("mcp:count", error, { userId });
    return 0;
  }
  return count ?? 0;
}

export async function addMcpServer(params: {
  userId: string;
  name: string;
  url: string;
  token: string | null;
  tools: McpToolSummary[];
}): Promise<{ ok: true; server: McpServerSummary } | { ok: false; reason: "duplicate" | "error" }> {
  const { data, error } = await createAdminClient()
    .from("mcp_servers")
    .insert({
      user_id: params.userId,
      name: params.name,
      url: params.url,
      auth_token_encrypted: params.token ? encryptSecret(params.token, tokenContext(params.userId, "mcp", "access")) : null,
      tools: params.tools,
      tools_checked_at: new Date().toISOString(),
      status: "connected",
    })
    .select("*")
    .single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, reason: "duplicate" };
    logApiError("mcp:add", error ?? "no row", { userId: params.userId });
    return { ok: false, reason: "error" };
  }
  return { ok: true, server: summarise(data as Row) };
}

export async function deleteMcpServer(userId: string, id: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from("mcp_servers").delete().eq("id", id).eq("user_id", userId).select("id");
  if (error) {
    logApiError("mcp:delete", error, { userId });
    return false;
  }
  return (data ?? []).length > 0;
}

export async function saveMcpTools(userId: string, id: string, tools: McpToolSummary[], status: "connected" | "error"): Promise<void> {
  const { error } = await createAdminClient()
    .from("mcp_servers")
    .update({ tools, status, tools_checked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) logApiError("mcp:save-tools", error, { userId });
}

/** The server as a call needs it: its address, its tools and its token in the clear. */
export async function getMcpServerForUse(
  userId: string,
  id: string
): Promise<{ ok: true; summary: McpServerSummary; token: string | null } | { ok: false; reason: "not_found" | "undecryptable" }> {
  const { data, error } = await createAdminClient().from("mcp_servers").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) {
    logApiError("mcp:get", error, { userId });
    return { ok: false, reason: "not_found" };
  }
  if (!data) return { ok: false, reason: "not_found" };
  const row = data as Row;
  let token: string | null = null;
  if (row.auth_token_encrypted) {
    try {
      token = decryptSecret(row.auth_token_encrypted, tokenContext(userId, "mcp", "access"));
    } catch (err) {
      logApiError("mcp:decrypt", safeErrorDetail(err), { userId });
      return { ok: false, reason: "undecryptable" };
    }
  }
  return { ok: true, summary: summarise(row), token };
}
