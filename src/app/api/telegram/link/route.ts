import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { isFeatureOn } from "@/lib/flags/flags";
import { checkRateLimit } from "@/lib/rate-limit";
import { encryptionAvailable } from "@/lib/integrations/crypto";
import { telegramBotUsername } from "@/lib/notify/channels/telegram";
import { readTelegramState } from "@/lib/telegram/link-state";
import {
  newPairingCode,
  formatPairingCode,
  telegramDeepLink,
  isTelegramPairingExpired,
  TELEGRAM_PAIRING_TTL_MINUTES,
  TELEGRAM_POLL_SECONDS,
} from "@/lib/telegram/pairing";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * THE ACCOUNT'S SIDE OF «IONEXA ΣΤΟ TELEGRAM» (the owner's directive 24,
 * κομμάτι 1). GET is what /dashboard/integrations draws and polls; POST
 * starts a connection, confirms it or cancels it; DELETE disconnects.
 *
 * WHAT IS NOT HERE, ON PURPOSE: the webhook. Nothing in this file reads a
 * message, and no route in this product does yet — κομμάτι 2 is «Webhook
 * με secret token». So the middle of the flow (a chat presents the code,
 * the row's chat columns get filled) has no writer until that lands, and
 * GET below reports `waiting` for the whole ten minutes. That is the
 * honest state of κομμάτι 1 and the screen says so in those words rather
 * than spinning.
 *
 * No @service-role-justified marker is needed for the admin client below,
 * for the same reason api/iowork/devices needs none: this route
 * establishes the session itself with auth.getUser() and every row it
 * reads or writes is filtered on that user's id. The admin client is here
 * only because public.telegram_pairings deliberately has no RLS policy at
 * all — a pending code must not be readable from a browser, or it could be
 * harvested before it is used (supabase/migrations/
 * 20261031000001_telegram_link.sql).
 */

type PairingRow = {
  id: string;
  code: string;
  chat_id_fingerprint: string | null;
  chat_id_encrypted: string | null;
  telegram_username: string | null;
  telegram_name: string | null;
  presented_at: string | null;
  confirmed_at: string | null;
  created_at: string;
};

const ACTIONS = ["start", "confirm", "cancel"] as const;
type Action = (typeof ACTIONS)[number];

/** A signed-in user, the switch, and the one encryption key this feature
 *  cannot work without — in that order, because the first two are cheap
 *  and the third is the one that needs explaining on screen. */
async function gate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { refusal: NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 }) };
  if (!(await isFeatureOn("telegram-bot", user))) {
    return { refusal: NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 }) };
  }
  return { user, supabase };
}

export async function GET() {
  const g = await gate();
  if (g.refusal) return g.refusal;
  const { user } = g;

  try {
    // ONE READER, SHARED WITH THE PAGE. src/lib/telegram/link-state.ts is
    // what /dashboard/integrations renders on the server, so the first
    // paint and this poll cannot disagree about whether a code is alive.
    return NextResponse.json({ ok: true, ...(await readTelegramState(user)) });
  } catch (err) {
    logApiError("/api/telegram/link", err, { stage: "read" });
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const g = await gate();
  if (g.refusal) return g.refusal;
  const { user } = g;

  const body = await request.json().catch(() => null);
  const action = (body as { action?: unknown } | null)?.action;
  if (typeof action !== "string" || !(ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ ok: false, code: "bad_action" }, { status: 400 });
  }

  // Charged on every action, «cancel» included — it is one more call
  // against the same ceiling, not a free one. Twenty an hour per ACCOUNT
  // (not per address): the thing being bounded is a person or a script
  // filling the pairings table with live codes, and every caller here is
  // signed in, so the account is the honest identifier.
  const { allowed } = await checkRateLimit({
    scope: "telegram_link_act",
    identifier: user.id,
    maxAttempts: 20,
    windowMinutes: 60,
  });
  if (!allowed) return NextResponse.json({ ok: false, code: "rateLimited" }, { status: 429 });

  try {
    if (action === "start") return await startPairing(user.id);
    if (action === "cancel") return await cancelPairing(user.id);
    return await confirmPairing(user.id);
  } catch (err) {
    logApiError("/api/telegram/link", err, { stage: action });
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}

async function startPairing(userId: string) {
  // THE TWO THINGS THAT MUST EXIST BEFORE A CODE IS SHOWN. A code the
  // person cannot use is worse than a refusal: they will send it
  // somewhere, and «somewhere» is a chat window.
  const botUsername = await telegramBotUsername();
  if (!botUsername) return NextResponse.json({ ok: false, code: "bot_unavailable" }, { status: 503 });
  if (!encryptionAvailable()) {
    return NextResponse.json({ ok: false, code: "encryption_unavailable" }, { status: 503 });
  }

  const admin = createAdminClient();

  // Already connected? Then this is not a start, it is a replace, and a
  // replace is the person disconnecting first — said as a refusal rather
  // than silently overwriting the row that decides who may spend their
  // credits.
  const { count, error: countError } = await admin
    .from("telegram_links")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countError) throw countError;
  if ((count ?? 0) > 0) return NextResponse.json({ ok: false, code: "already_linked" }, { status: 409 });

  // `code` is unique, so a collision is a failed insert rather than two
  // pairings answering to one code. Three tries: at 32^8 the second is
  // already theatre, but an insert that fails for any other reason should
  // not read as "all codes are taken".
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newPairingCode();
    const { error } = await admin.from("telegram_pairings").insert({ code, user_id: userId });
    if (!error) {
      return NextResponse.json({
        ok: true,
        status: "waiting",
        code,
        display: formatPairingCode(code),
        deepLink: telegramDeepLink(botUsername, code),
        secondsLeft: TELEGRAM_PAIRING_TTL_MINUTES * 60,
        expiresInMinutes: TELEGRAM_PAIRING_TTL_MINUTES,
        pollSeconds: TELEGRAM_POLL_SECONDS,
        botUsername,
      });
    }
    if (attempt === 2) {
      logApiError("/api/telegram/link", error, { stage: "insert" });
      return NextResponse.json({ ok: false, code: "not_started" }, { status: 500 });
    }
  }
  // Unreachable: the loop either returns or logs on its last attempt.
  return NextResponse.json({ ok: false, code: "not_started" }, { status: 500 });
}

/** Kill every live code this account has. Not «the one on screen»: a
 *  person pressing Cancel means "I did not ask for this", and leaving an
 *  older code of theirs alive for another nine minutes would answer a
 *  different question. Unconfirmed only — a pairing that already became a
 *  link is not this call's to touch; DELETE is. */
async function cancelPairing(userId: string) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("telegram_pairings")
    .delete()
    .eq("user_id", userId)
    .is("confirmed_at", null);
  if (error) throw error;
  return NextResponse.json({ ok: true, status: "cancelled" });
}

/**
 * THE ONLY STEP THAT CREATES THE GRANT, and it is deliberately not the one
 * that happens in Telegram.
 *
 * A chat presenting a valid code gets as far as its name being written on
 * the pairing row (κομμάτι 2). This — a signed-in session, on the screen
 * that showed that name — is what turns it into a link. A leaked code
 * therefore is not enough, because the attacker cannot reach this call.
 *
 * SINGLE USE BY COMPARE-AND-SWAP, not by reading first. The update is
 * guarded on `confirmed_at is null` and the result is READ BACK with
 * .select(): Postgres does not error on an update that matched zero rows,
 * so "no error" is not "it was mine". Zero rows means somebody else's
 * confirm landed first, or this code was already spent, and both answer
 * the same refusal.
 */
async function confirmPairing(userId: string) {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("telegram_pairings")
    .select("id, code, chat_id_fingerprint, chat_id_encrypted, telegram_username, telegram_name, presented_at, confirmed_at, created_at")
    .eq("user_id", userId)
    .is("confirmed_at", null)
    .not("presented_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const pairing = ((data as PairingRow[] | null) ?? [])[0] ?? null;

  // Nothing to confirm, and nothing to confirm says so plainly: there is
  // no guesser to keep in the dark here, because every row this query can
  // see is already filtered to the caller's own account.
  if (!pairing) return NextResponse.json({ ok: false, code: "nothing_to_confirm" }, { status: 404 });
  if (isTelegramPairingExpired(pairing.created_at)) {
    return NextResponse.json({ ok: false, code: "expired" }, { status: 410 });
  }

  const { data: spent, error: spendError } = await admin
    .from("telegram_pairings")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", pairing.id)
    .is("confirmed_at", null)
    .select("id");
  if (spendError) throw spendError;
  if (!spent || spent.length === 0) {
    return NextResponse.json({ ok: false, code: "nothing_to_confirm" }, { status: 404 });
  }

  // THE GRANT IS CREATED HERE, BY THE SIGNED-IN PRESS, AND NOWHERE ELSE.
  //
  // The webhook (κομμάτι 2) could do this — by the time a code has been
  // presented it already holds the chat id in both shapes on the pairing
  // row, so the insert would be one line there. It must not. A webhook is
  // reachable by anybody who can make Telegram deliver a message; this
  // call is reachable only from a signed-in session on the account's own
  // Connect page. Keeping the INSERT on this side means the webhook never
  // mints authority over an account, only ever records a request for it,
  // and the thing that decides is the person.
  //
  // Null columns are not a half-built state: they mean the webhook has not
  // written them yet, in which case there was nothing to confirm and the
  // query above (.not("presented_at", "is", null)) already refused.
  const { error: linkError } = await admin.from("telegram_links").insert({
    user_id: userId,
    chat_id_fingerprint: pairing.chat_id_fingerprint,
    chat_id_encrypted: pairing.chat_id_encrypted,
    telegram_username: pairing.telegram_username,
    telegram_name: pairing.telegram_name,
    chat_kind: "private",
  });
  if (linkError) {
    // THE CODE IS ALREADY SPENT and the link did not happen. Say so
    // plainly rather than reporting a connection: the commonest cause is
    // the unique index on chat_id_fingerprint refusing a chat that
    // already commands another account, which is the constraint doing
    // exactly its job (supabase/migrations/20261031000001_telegram_link.sql).
    logApiError("/api/telegram/link", linkError, { stage: "confirm-insert" });
    return NextResponse.json({ ok: false, code: "chat_in_use" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, status: "confirmed", username: pairing.telegram_username, name: pairing.telegram_name });
}

/**
 * DISCONNECT — a delete, not a flag.
 *
 * Once the row is gone the chat's fingerprint matches nothing, so the next
 * message from it is a message from a stranger, with no second check
 * anywhere that could be forgotten. Through the SESSION client, because
 * telegram_links carries a delete-own policy and RLS refusing is a
 * stronger guarantee than this function remembering to filter.
 *
 * Notifications are NOT touched. public.notification_channels is a
 * different grant («Ionexa may send here») and the person did not ask to
 * stop receiving anything — see the migration header's TWO GRANTS.
 */
export async function DELETE() {
  const g = await gate();
  if (g.refusal) return g.refusal;
  const { user, supabase } = g;

  const { allowed } = await checkRateLimit({
    scope: "telegram_link_act",
    identifier: user.id,
    maxAttempts: 20,
    windowMinutes: 60,
  });
  if (!allowed) return NextResponse.json({ ok: false, code: "rateLimited" }, { status: 429 });

  try {
    const { error } = await supabase.from("telegram_links").delete().eq("user_id", user.id);
    if (error) throw error;
    // Any live code goes too: a person disconnecting does not want the
    // half-finished connection they started five minutes ago to complete.
    const admin = createAdminClient();
    await admin.from("telegram_pairings").delete().eq("user_id", user.id).is("confirmed_at", null);
    return NextResponse.json({ ok: true, status: "disconnected" });
  } catch (err) {
    logApiError("/api/telegram/link", err, { stage: "disconnect" });
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
