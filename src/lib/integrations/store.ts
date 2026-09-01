import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import {
  encryptSecret,
  decryptSecret,
  tokenContext,
  safeErrorDetail,
} from "@/lib/integrations/crypto";
import {
  getProvider,
  type ProviderId,
  type IntegrationSummary,
  type IntegrationStatus,
} from "@/lib/integrations/providers";
import { refreshAccessToken, revokeAtProvider, type TokenSet } from "@/lib/integrations/oauth";

/** Far above any plan's integration allowance (the highest is
 *  INTEGRATION_LIMIT_ULTIMATE), so nobody reaches it in practice — but a
 *  list with no ceiling is a list that grows without one. Same reasoning
 *  and same shape as RECORD_CAP. */
const INTEGRATION_ROW_CAP = 200;

// The only code that touches a decrypted token.
//
// Every caller above this line — chat, agents, the AI Life Context —
// receives either a usable access token or a reason it could not get one.
// None of them ever sees the row, and none of them ever handles the
// refresh dance, so there is exactly one place where "is this token still
// good?" is decided.
//
// LOGGING RULE, enforced by construction: every logApiError call in this
// file passes its context through redactSecrets(). A token in a log is a
// token in a log aggregator, a token in a screenshot, and a token in a
// support ticket.

export type IntegrationRow = {
  id: string;
  user_id: string;
  provider: ProviderId;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  expires_at: string | null;
  scopes: string[];
  connected_at: string;
  last_sync_at: string | null;
  status: IntegrationStatus;
  metadata: Record<string, unknown>;
};

function summarise(row: IntegrationRow): IntegrationSummary {
  const metadata = row.metadata ?? {};
  const label =
    typeof metadata.account_email === "string"
      ? metadata.account_email
      : typeof metadata.team_name === "string"
        ? metadata.team_name
        : null;
  return {
    id: row.id,
    provider: row.provider,
    status: row.status,
    scopes: row.scopes ?? [],
    connected_at: row.connected_at,
    last_sync_at: row.last_sync_at,
    account_label: label,
  };
}

/** Everything the client is allowed to know. Never a token, never the raw row. */
export async function listIntegrations(userId: string): Promise<IntegrationSummary[]> {
  const admin = createAdminClient();
  // BOUNDED BY THE QUERY, not only by the product.
  //
  // This was scoped to one user and otherwise unbounded. In practice a
  // plan caps integrations at INTEGRATION_LIMIT_ULTIMATE, so the row
  // count is small — but "small because a product rule says so" is a
  // property of a different file, and the day that rule changes or a
  // migration leaves stale rows behind, this reads all of them.
  //
  // A LIMIT IS SAFE HERE AND WAS NOT SAFE IN lib/reflection.ts, and the
  // difference is worth naming: this list is RENDERED, one row per
  // connected account, so a cap truncates a list — visible, and above
  // any real account's count. reflection.ts COUNTS over its rows, where
  // a cap silently changes a total instead.
  const { data, error } = await admin
    .from("user_integrations")
    .select("*")
    .eq("user_id", userId)
    .order("connected_at", { ascending: false })
    .limit(INTEGRATION_ROW_CAP);
  if (error) {
    logApiError("integrations:list", error, { userId });
    return [];
  }
  return ((data as IntegrationRow[] | null) ?? []).map(summarise);
}

export async function countConnectedIntegrations(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("user_integrations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "connected");
  if (error) {
    logApiError("integrations:count", error, { userId });
    // Fails CLOSED, unlike most counting in this app: this number gates a
    // plan limit, and an unreadable count must not become "unlimited".
    return Number.MAX_SAFE_INTEGER;
  }
  return count ?? 0;
}

/**
 * Stores a freshly granted token set, replacing any previous grant for the
 * same provider.
 *
 * `accountLabel` is the only thing about the connected account that is
 * kept in cleartext, and it is the only thing the user needs to see to
 * know WHICH account is connected.
 */
export async function saveIntegration(params: {
  userId: string;
  provider: ProviderId;
  tokens: TokenSet;
  accountLabel?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const { userId, provider, tokens, accountLabel } = params;
  if (!tokens.accessToken) return { ok: false, reason: "no_access_token" };

  try {
    const admin = createAdminClient();
    const row = {
      user_id: userId,
      provider,
      access_token_encrypted: encryptSecret(tokens.accessToken, tokenContext(userId, provider, "access")),
      refresh_token_encrypted: tokens.refreshToken
        ? encryptSecret(tokens.refreshToken, tokenContext(userId, provider, "refresh"))
        : null,
      expires_at: tokens.expiresAt ? tokens.expiresAt.toISOString() : null,
      scopes: tokens.scopes,
      status: "connected" as const,
      connected_at: new Date().toISOString(),
      metadata: {
        ...tokens.metadata,
        ...(accountLabel ? { account_email: accountLabel } : {}),
      },
    };

    const { data, error } = await admin
      .from("user_integrations")
      .upsert(row, { onConflict: "user_id,provider" })
      .select("id")
      .single();

    if (error || !data) {
      logApiError("integrations:save", error, { userId, provider });
      return { ok: false, reason: "save_failed" };
    }
    return { ok: true, id: String(data.id) };
  } catch (err) {
    // Only the provider and the stage. The thing that failed to encrypt is
    // the token itself, so nothing about the value goes anywhere near this.
    logApiError("integrations:save", safeErrorDetail(err), { userId, provider, stage: "encrypt" });
    return { ok: false, reason: "encryption_unavailable" };
  }
}

export type UsableToken =
  | { ok: true; accessToken: string; integrationId: string; scopes: string[] }
  | { ok: false; reason: "not_connected" | "expired" | "revoked" | "undecryptable" | "error" };

/**
 * A token that can be used right now, refreshing it first if it is about
 * to expire.
 *
 * Refresh happens HERE rather than in a background job on purpose: a job
 * that renews tokens on a schedule renews tokens nobody is using, and
 * still races the request that needed one a second before the job ran.
 * Renewing at the point of use is both cheaper and always correct.
 */
export async function getUsableAccessToken(
  userId: string,
  providerId: ProviderId
): Promise<UsableToken> {
  const provider = getProvider(providerId);
  if (!provider) return { ok: false, reason: "not_connected" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", providerId)
    .maybeSingle();

  if (error) {
    logApiError("integrations:token", error, { userId, provider: providerId });
    return { ok: false, reason: "error" };
  }
  if (!data) return { ok: false, reason: "not_connected" };

  const row = data as IntegrationRow;
  if (row.status === "revoked") return { ok: false, reason: "revoked" };

  let accessToken: string;
  try {
    accessToken = decryptSecret(row.access_token_encrypted, tokenContext(userId, providerId, "access"));
  } catch (err) {
    // A row that cannot be decrypted is a row written under a different
    // key — a rotated secret, or a restored backup. It is not recoverable
    // and it must not be retried forever, so the integration is marked and
    // the user is told to reconnect.
    logApiError("integrations:token", safeErrorDetail(err), {
      userId,
      provider: providerId,
      stage: "decrypt_access",
    });
    await markStatus(row.id, "error");
    return { ok: false, reason: "undecryptable" };
  }

  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const stillValid = !expiresAt || expiresAt.getTime() > Date.now();
  if (stillValid) {
    return { ok: true, accessToken, integrationId: row.id, scopes: row.scopes ?? [] };
  }

  // Expired. Renew, if there is anything to renew with.
  if (!row.refresh_token_encrypted) {
    await markStatus(row.id, "expired");
    return { ok: false, reason: "expired" };
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(
      row.refresh_token_encrypted,
      tokenContext(userId, providerId, "refresh")
    );
  } catch {
    await markStatus(row.id, "error");
    return { ok: false, reason: "undecryptable" };
  }

  const refreshed = await refreshAccessToken({ provider, refreshToken });
  if (!refreshed.ok) {
    // invalid_grant means the user revoked us on the provider's side. That
    // is a different state from "the network was down", and conflating
    // them would either nag a user whose token is fine or silently keep
    // retrying a grant that will never work again.
    const revoked = /invalid_grant|revoked|account_inactive|token_revoked/i.test(refreshed.reason);
    await markStatus(row.id, revoked ? "revoked" : "expired");
    logApiError("integrations:refresh", new Error(refreshed.reason), {
      userId,
      provider: providerId,
    });
    return { ok: false, reason: revoked ? "revoked" : "expired" };
  }

  const saved = await saveIntegration({
    userId,
    provider: providerId,
    tokens: refreshed.tokens,
    accountLabel:
      typeof row.metadata?.account_email === "string" ? row.metadata.account_email : null,
  });
  if (!saved.ok) return { ok: false, reason: "error" };

  return {
    ok: true,
    accessToken: refreshed.tokens.accessToken,
    integrationId: row.id,
    scopes: refreshed.tokens.scopes.length > 0 ? refreshed.tokens.scopes : row.scopes ?? [],
  };
}

async function markStatus(integrationId: string, status: IntegrationStatus): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("user_integrations").update({ status }).eq("id", integrationId);
  } catch (err) {
    logApiError("integrations:status", err, { integrationId, status });
  }
}

/**
 * Disconnect: revoke at the provider, then delete our copy.
 *
 * In that order, and both halves matter. Deleting first would leave a live
 * grant in the user's Google account that we no longer have the token to
 * revoke — the user would have to go and find it themselves, which is
 * exactly the "disconnect didn't really disconnect" that makes people
 * distrust integrations. Revocation is best-effort (a provider outage must
 * not block erasure), and the deletion happens either way.
 */
export async function disconnectIntegration(
  userId: string,
  providerId: ProviderId
): Promise<{ ok: boolean; revokedAtProvider: boolean }> {
  const provider = getProvider(providerId);
  const admin = createAdminClient();

  let revoked = false;
  try {
    const { data } = await admin
      .from("user_integrations")
      .select("access_token_encrypted")
      .eq("user_id", userId)
      .eq("provider", providerId)
      .maybeSingle();

    if (data?.access_token_encrypted && provider) {
      try {
        const token = decryptSecret(
          data.access_token_encrypted,
          tokenContext(userId, providerId, "access")
        );
        revoked = await revokeAtProvider(provider, token);
      } catch {
        // Undecryptable — nothing to revoke with. The row still goes.
        revoked = false;
      }
    }
  } catch (err) {
    logApiError("integrations:disconnect", err, { userId, provider: providerId, stage: "revoke" });
  }

  // The delete cascades to integration_sync_log, so the audit trail of
  // what was read goes with the grant — which is what erasure means.
  const { error } = await admin
    .from("user_integrations")
    .delete()
    .eq("user_id", userId)
    .eq("provider", providerId);

  if (error) {
    logApiError("integrations:disconnect", error, { userId, provider: providerId, stage: "delete" });
    return { ok: false, revokedAtProvider: revoked };
  }
  return { ok: true, revokedAtProvider: revoked };
}

/**
 * Records that the AI read something, so the user can see what it looked
 * at. Counts and outcomes only — never content.
 */
export async function recordSync(params: {
  integrationId: string;
  userId: string;
  itemsSynced: number;
  source: "chat" | "agent" | "life_context" | "manual";
  status?: "success" | "failed";
  error?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("integration_sync_log").insert({
      integration_id: params.integrationId,
      user_id: params.userId,
      items_synced: Math.max(0, Math.floor(params.itemsSynced)),
      source: params.source,
      status: params.status ?? "success",
      error: params.error ? String(params.error).slice(0, 300) : null,
    });
    await admin
      .from("user_integrations")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", params.integrationId);
  } catch (err) {
    // Observability must never break the thing it observes.
    logApiError("integrations:sync-log", err, { integrationId: params.integrationId });
  }
}
