import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { CONSENT_VERSION, getProvider, type ProviderId } from "@/lib/integrations/providers";

export { CONSENT_VERSION };

// Consent, as a thing that happened rather than a thing that was displayed.
//
// The app already SHOWED a consent panel before every OAuth connect. It
// was not enforcement and it was not a record:
//
//   * /api/integrations/gmail/connect answered a bare GET. Anything that
//     could produce that request — a bookmark, a link, another page in the
//     app — started the OAuth flow with the panel never rendered. A screen
//     you can walk past is a design, not a control.
//   * Nothing was written down. "Did this person agree, when, and to what
//     wording" had no answer anywhere in the system, which is precisely
//     the question GDPR Art. 7(1) says a controller must be able to answer.
//
// So: the panel now POSTs here first, this writes a row, and the connect
// endpoint refuses to redirect without one. The record survives the
// disconnect it authorised — revoked, not deleted — because the history of
// an access grant is not erased by ending it.

// CONSENT_VERSION itself lives in providers.ts and is re-exported above —
// the consent panel is a Client Component and cannot import this module.

export type ConsentRecord = {
  id: string;
  provider: ProviderId;
  scopes: string[];
  consent_version: string;
  purpose: string;
  granted_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
};

/**
 * Is there a live agreement, at the CURRENT wording, for this provider?
 *
 * Fails CLOSED. An unreadable consent table means the connect flow is
 * refused, not waved through: the failure mode of a false negative is a
 * user pressing Connect again, and the failure mode of a false positive is
 * an OAuth grant nobody agreed to.
 */
export async function hasActiveConsent(userId: string, provider: ProviderId): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("integration_consents")
      .select("id, consent_version")
      .eq("user_id", userId)
      .eq("provider", provider)
      .is("revoked_at", null)
      .maybeSingle();
    if (error) {
      logApiError("integrations:consent:check", error, { userId, provider });
      return false;
    }
    return data?.consent_version === CONSENT_VERSION;
  } catch (err) {
    logApiError("integrations:consent:check", err, { userId, provider });
    return false;
  }
}

/**
 * Records an agreement, superseding any earlier live one for the same
 * provider.
 *
 * The supersede is a revoke, not an overwrite: reconnecting Gmail after
 * the wording changed leaves two rows, and the older one still says what
 * was agreed to in March. The partial unique index in the migration is
 * what makes "one live consent per provider" a database guarantee rather
 * than a convention this function happens to follow.
 *
 * `purpose` and `scopes` are passed in from the render, not read from the
 * registry here, for the same reason: this row has to say what the SCREEN
 * said, even after the registry changes.
 */
export async function recordConsent(params: {
  userId: string;
  provider: ProviderId;
  purpose: string;
  scopes: string[];
}): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const { userId, provider, purpose, scopes } = params;
  if (!getProvider(provider)) return { ok: false, reason: "unknown_provider" };
  if (!purpose.trim()) return { ok: false, reason: "no_purpose" };

  const admin = createAdminClient();
  try {
    const { error: supersedeError } = await admin
      .from("integration_consents")
      .update({ revoked_at: new Date().toISOString(), revoke_reason: "superseded" })
      .eq("user_id", userId)
      .eq("provider", provider)
      .is("revoked_at", null);
    if (supersedeError) {
      logApiError("integrations:consent:record", supersedeError, {
        userId,
        provider,
        stage: "supersede",
      });
      // Not fatal on its own, but the insert below would then collide with
      // the partial unique index and fail anyway — so stop here with a
      // reason rather than a constraint error.
      return { ok: false, reason: "supersede_failed" };
    }

    const { data, error } = await admin
      .from("integration_consents")
      .insert({
        user_id: userId,
        provider,
        // Truncated, not rejected: the purpose is display text and a long
        // translation must not be the thing that blocks a connection.
        purpose: purpose.slice(0, 2000),
        scopes,
        consent_version: CONSENT_VERSION,
      })
      .select("id")
      .single();

    if (error || !data) {
      logApiError("integrations:consent:record", error, { userId, provider, stage: "insert" });
      return { ok: false, reason: "insert_failed" };
    }
    return { ok: true, id: data.id };
  } catch (err) {
    logApiError("integrations:consent:record", err, { userId, provider });
    return { ok: false, reason: "unexpected" };
  }
}

/**
 * Withdraws consent.
 *
 * Returns ok even when there was nothing live to revoke: "I withdraw" must
 * never answer with an error the user has to interpret, and the end state
 * they asked for — no live consent — is the end state either way.
 */
export async function revokeConsent(
  userId: string,
  provider: ProviderId
): Promise<{ ok: boolean }> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("integration_consents")
      .update({ revoked_at: new Date().toISOString(), revoke_reason: "user_revoked" })
      .eq("user_id", userId)
      .eq("provider", provider)
      .is("revoked_at", null);
    if (error) {
      logApiError("integrations:consent:revoke", error, { userId, provider });
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    logApiError("integrations:consent:revoke", err, { userId, provider });
    return { ok: false };
  }
}

/** The user's own consent history, newest first — what Settings renders. */
export async function listConsents(userId: string): Promise<ConsentRecord[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("integration_consents")
      .select("id, provider, scopes, consent_version, purpose, granted_at, revoked_at, revoke_reason")
      .eq("user_id", userId)
      .order("granted_at", { ascending: false })
      .limit(100);
    if (error) {
      logApiError("integrations:consent:list", error, { userId });
      return [];
    }
    return (data as ConsentRecord[] | null) ?? [];
  } catch (err) {
    logApiError("integrations:consent:list", err, { userId });
    return [];
  }
}
