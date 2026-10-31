import "server-only";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isFeatureOn } from "@/lib/flags/flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptionAvailable } from "@/lib/integrations/crypto";
import { telegramBotUsername } from "@/lib/notify/channels/telegram";
import {
  formatPairingCode,
  telegramDeepLink,
  isTelegramPairingExpired,
  telegramPairingSecondsLeft,
  TELEGRAM_PAIRING_TTL_MINUTES,
  TELEGRAM_POLL_SECONDS,
} from "@/lib/telegram/pairing";

/**
 * WHAT /dashboard/integrations' Telegram section IS, read once.
 *
 * ONE FUNCTION, TWO CALLERS, AND THAT IS THE POINT: the page renders it on
 * the server so there is no flash of "not connected" on a connected
 * account, and api/telegram/link's GET answers the browser's poll with it.
 * Two copies of this would be two answers that can disagree about whether
 * a code is still alive — and the one the person is looking at would be
 * the stale one.
 *
 * IT OWNS THE SWITCH, AND THAT IS NOT TIDINESS. The Connect page may not
 * read a feature switch at all: scripts/tests/google-calendar.test.mjs:110
 * holds `!/isFeatureOn|providersOpenTo/` over dashboard/integrations/page.tsx,
 * because a switch called `connections` once hid Gmail, Drive, Calendar and
 * Slack from everybody and the rule since is that this page is open to
 * every account with no switch between them and it. Telegram's switch is a
 * different and legitimate one — it gates one new section, not the page —
 * so it is read HERE, and the page gets null when the section is not open.
 * That keeps the Calendar rule exactly as strong as it was.
 *
 * NEVER RETURNS A CHAT ID, in any shape. chat_id_fingerprint is a keyed
 * HMAC and chat_id_encrypted is a credential-shaped value; what a screen
 * needs is the Telegram name, which is what it gets.
 */
export type TelegramLinkState = {
  status: "none" | "waiting" | "presented" | "connected";
  code?: string | null;
  display?: string | null;
  deepLink?: string | null;
  username?: string | null;
  name?: string | null;
  secondsLeft?: number | null;
  connectedAt?: string | null;
  lastUsedAt?: string | null;
  expiresInMinutes?: number;
  pollSeconds?: number;
  botUsername: string | null;
  ready: boolean;
};

type LinkRow = {
  telegram_username: string | null;
  telegram_name: string | null;
  created_at: string;
  last_used_at: string | null;
};

type PairingRow = {
  id: string;
  code: string;
  telegram_username: string | null;
  telegram_name: string | null;
  presented_at: string | null;
  created_at: string;
};

/** Null means "this account is not in the switch's audience", which the
 *  page renders as nothing at all rather than as a disabled section. */
export async function readTelegramState(user: User): Promise<TelegramLinkState | null> {
  if (!(await isFeatureOn("telegram-bot", user))) return null;
  const userId = user.id;
  const supabase = await createClient();

  // The link through the SESSION client: the row is the person's own and
  // telegram_links carries a select-own policy, so RLS is doing the
  // filtering and a mistake in this query cannot reach another row.
  const { data: linkData, error: linkError } = await supabase
    .from("telegram_links")
    .select("telegram_username, telegram_name, created_at, last_used_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (linkError) throw linkError;
  const link = linkData as LinkRow | null;

  const botUsername = await telegramBotUsername();
  // WHETHER THIS DEPLOYMENT CAN FINISH A CONNECTION AT ALL. No bot token
  // means no bot to open; no encryption key means the chat id could only
  // be stored in a shape this product did not promise, and the answer to
  // that is to refuse the feature, never to store it anyway.
  const ready = botUsername !== null && encryptionAvailable();

  if (link) {
    return {
      status: "connected",
      username: link.telegram_username,
      name: link.telegram_name,
      connectedAt: link.created_at,
      lastUsedAt: link.last_used_at,
      botUsername,
      ready,
    };
  }

  // The newest unconfirmed pairing, through the ADMIN client because
  // telegram_pairings deliberately has no RLS policy at all — a pending
  // code must not be readable from a browser, or it could be harvested
  // before it is used (supabase/migrations/20261031000001_telegram_link.sql).
  // Filtered on the caller's own id, which is the whole of its authority.
  const admin = createAdminClient();
  const { data: pendingData, error: pendingError } = await admin
    .from("telegram_pairings")
    .select("id, code, telegram_username, telegram_name, presented_at, created_at")
    .eq("user_id", userId)
    .is("confirmed_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (pendingError) throw pendingError;
  const pending = ((pendingData as PairingRow[] | null) ?? [])[0] ?? null;

  if (!pending || isTelegramPairingExpired(pending.created_at)) {
    return { status: "none", botUsername, ready };
  }

  return {
    // «waiting» until a chat has presented the code, «presented» once one
    // has and the person has to say whether it is theirs.
    status: pending.presented_at ? "presented" : "waiting",
    code: pending.code,
    display: formatPairingCode(pending.code),
    deepLink: telegramDeepLink(botUsername, pending.code),
    username: pending.telegram_username,
    name: pending.telegram_name,
    secondsLeft: telegramPairingSecondsLeft(pending.created_at),
    expiresInMinutes: TELEGRAM_PAIRING_TTL_MINUTES,
    pollSeconds: TELEGRAM_POLL_SECONDS,
    botUsername,
    ready,
  };
}
