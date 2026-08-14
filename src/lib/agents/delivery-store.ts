import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret, encryptionAvailable, safeErrorDetail } from "@/lib/integrations/crypto";
import { logApiError } from "@/lib/log-error";
import {
  isTelegramBotToken,
  isDiscordWebhookUrl,
  normaliseTelegramChat,
  redactSecret,
  type CredentialChannel,
} from "@/lib/agents/delivery-channels";

/**
 * Saving, reading and proving the credentials an agent delivers with.
 *
 * ENCRYPTED WITH THE SAME KEY AND THE SAME REFUSAL as the OAuth tokens
 * next door: with no INTEGRATION_ENCRYPTION_KEY configured, this refuses to
 * store anything. A Telegram bot token in plaintext is not a degraded
 * mode — whoever reads that row can speak as the user's bot until they
 * notice and revoke it, and a Discord webhook URL is a standing right to
 * post into their server.
 *
 * AND IT IS VERIFIED BEFORE IT IS TRUSTED. A token that satisfies a regex
 * and was never tried is a delivery that fails at 08:00 on a morning
 * nobody is watching, on an agent the user believes is working. Saving
 * calls the platform once, with a real message, and stores the credential
 * only if the platform accepted it.
 */

/** The AAD, built like tokenContext: whose secret and which channel, both
 *  bound to the ciphertext rather than merely adjacent to it in a row. */
function channelContext(userId: string, channel: CredentialChannel): string {
  return `ionexa:delivery:${channel}:${userId}`;
}

export type SavedChannel = {
  channel: CredentialChannel;
  /** Telegram's chat id. Empty for Discord. */
  target: string;
  /** "1234••••wxyz" — never the secret. */
  secretHint: string;
  verifiedAt: string | null;
  updatedAt: string;
};

export type SaveChannelResult =
  | { ok: true; channel: SavedChannel }
  | { ok: false; reason: "invalid" | "unverified" | "not_configured" | "error"; message: string };

/**
 * Stores a credential after proving it works.
 *
 * The order is deliberate: validate the shape, ASK THE PLATFORM, then
 * write. Writing first and verifying later would leave a row that looks
 * connected on the settings page and delivers nothing.
 */
export async function saveDeliveryChannel(params: {
  userId: string;
  channel: CredentialChannel;
  secret: string;
  /** Telegram only. */
  chat?: string;
}): Promise<SaveChannelResult> {
  const { userId, channel } = params;
  const secret = String(params.secret ?? "").trim();

  if (!encryptionAvailable()) {
    // Refused, not stored in the clear. Stated plainly because this is an
    // operator's missing environment variable, not the user's mistake.
    return {
      ok: false,
      reason: "not_configured",
      message: "Secure storage is not configured on the server, so this cannot be saved.",
    };
  }

  let target = "";
  if (channel === "telegram") {
    if (!isTelegramBotToken(secret)) {
      return { ok: false, reason: "invalid", message: "That is not a Telegram bot token." };
    }
    target = normaliseTelegramChat(params.chat);
    if (!target) {
      return { ok: false, reason: "invalid", message: "That is not a Telegram chat id." };
    }
  } else {
    if (!isDiscordWebhookUrl(secret)) {
      return { ok: false, reason: "invalid", message: "That is not a Discord webhook address." };
    }
  }

  const proof = channel === "telegram" ? await verifyTelegram(secret, target) : await verifyDiscord(secret);
  if (!proof.ok) {
    return { ok: false, reason: "unverified", message: proof.message };
  }

  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { error } = await admin.from("user_delivery_channels").upsert(
      {
        user_id: userId,
        channel,
        secret_encrypted: encryptSecret(secret, channelContext(userId, channel)),
        target,
        secret_hint: redactSecret(secret),
        verified_at: now,
        updated_at: now,
      },
      { onConflict: "user_id,channel" }
    );
    if (error) throw error;
    return {
      ok: true,
      channel: { channel, target, secretHint: redactSecret(secret), verifiedAt: now, updatedAt: now },
    };
  } catch (err) {
    // safeErrorDetail, never the raw error: a driver error can quote the
    // row it failed on, and the row contains the ciphertext.
    logApiError("agents:delivery-store", new Error(safeErrorDetail(err)), { userId, channel });
    return { ok: false, reason: "error", message: "Could not save that connection." };
  }
}

/** The user's configured channels, WITHOUT their secrets. The only shape
 *  that ever reaches a browser. */
export async function listDeliveryChannels(userId: string): Promise<SavedChannel[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_delivery_channels")
      .select("channel, target, secret_hint, verified_at, updated_at")
      .eq("user_id", userId);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      channel: row.channel as CredentialChannel,
      target: String(row.target ?? ""),
      secretHint: String(row.secret_hint ?? ""),
      verifiedAt: (row.verified_at as string | null) ?? null,
      updatedAt: String(row.updated_at ?? ""),
    }));
  } catch (err) {
    logApiError("agents:delivery-store", new Error(safeErrorDetail(err)), { userId, stage: "list" });
    // Empty, not a throw: an unreadable list must fail CLOSED — no
    // channel appears configured, so nothing can be selected — rather
    // than taking a settings page down.
    return [];
  }
}

/** The secret, for the worker that is about to deliver. Server-only, and
 *  never returned to a route that answers a browser. */
export async function readDeliverySecret(
  userId: string,
  channel: CredentialChannel
): Promise<{ secret: string; target: string } | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_delivery_channels")
      .select("secret_encrypted, target")
      .eq("user_id", userId)
      .eq("channel", channel)
      .maybeSingle();
    if (error) throw error;
    if (!data?.secret_encrypted) return null;
    return {
      secret: decryptSecret(String(data.secret_encrypted), channelContext(userId, channel)),
      target: String(data.target ?? ""),
    };
  } catch (err) {
    logApiError("agents:delivery-store", new Error(safeErrorDetail(err)), { userId, channel, stage: "read" });
    return null;
  }
}

export async function deleteDeliveryChannel(userId: string, channel: CredentialChannel): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("user_delivery_channels")
      .delete()
      .eq("user_id", userId)
      .eq("channel", channel);
    if (error) throw error;
    return true;
  } catch (err) {
    logApiError("agents:delivery-store", new Error(safeErrorDetail(err)), { userId, channel, stage: "delete" });
    return false;
  }
}

// ---------------------------------------------------------------------
// Proving it works
// ---------------------------------------------------------------------

/** Every outbound call here is bounded. An unbounded fetch to a host the
 *  user chose is a way to hold a serverless invocation open. */
const VERIFY_TIMEOUT_MS = 8_000;

async function postJson(url: string, body: unknown): Promise<{ status: number; text: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      // Never follow a redirect. A 302 is how an allow-listed host hands
      // the request — and the user's data with it — to one that is not.
      redirect: "manual",
    });
    return { status: response.status, text: (await response.text()).slice(0, 400) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function verifyTelegram(token: string, chat: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const result = await postJson(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
    chat_id: chat,
    text: "Ionexa is connected. Your agent results will arrive here.",
    disable_notification: true,
  });
  if (!result) return { ok: false, message: "Telegram did not respond — check the token and try again." };
  if (result.status === 200) return { ok: true };
  // Telegram's own words are the useful ones here, and they are not
  // secret: "chat not found", "bot was blocked by the user".
  const description = (() => {
    try {
      return String(JSON.parse(result.text)?.description ?? "");
    } catch {
      return "";
    }
  })();
  if (/chat not found/i.test(description)) {
    return { ok: false, message: "Telegram cannot find that chat — send your bot a message first, then try again." };
  }
  if (result.status === 401 || /unauthorized/i.test(description)) {
    return { ok: false, message: "Telegram rejected that bot token." };
  }
  return { ok: false, message: description ? `Telegram refused: ${description}` : "Telegram refused that connection." };
}

async function verifyDiscord(webhookUrl: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const result = await postJson(webhookUrl, {
    content: "Ionexa is connected. Your agent results will arrive here.",
  });
  if (!result) return { ok: false, message: "Discord did not respond — check the address and try again." };
  // 204 is the success answer for a webhook post; 200 when wait=true.
  if (result.status === 204 || result.status === 200) return { ok: true };
  if (result.status === 401 || result.status === 403 || result.status === 404) {
    return { ok: false, message: "Discord rejected that webhook address — it may have been deleted." };
  }
  return { ok: false, message: "Discord refused that connection." };
}
