import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";
import {
  minutesToSeconds,
  voiceAllowance,
  type VoiceAllowance,
} from "@/lib/voice/voice-pricing";

/**
 * THE MONTHLY LEDGER, from the server's side.
 *
 * Two operations and nothing else: read what has been used, and consume
 * some — atomically, through the function that does the check and the
 * write in one statement (see the 20260827 migration).
 */

export async function readVoiceUsage(
  admin: SupabaseClient,
  userId: string,
  limitMinutes: number
): Promise<VoiceAllowance> {
  try {
    const { data, error } = await admin.rpc("voice_usage_this_month", { p_user_id: userId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    const used =
      Number(row?.transcribe_seconds ?? 0) + Number(row?.speak_seconds ?? 0);
    return voiceAllowance(limitMinutes, used);
  } catch (err) {
    logApiError("voice:readUsage", err, { userId });
    // FAILS CLOSED, unlike almost everything else in this codebase.
    //
    // A counting hiccup on a rate limit fails open, because stopping
    // somebody's work over a database blip is worse than one extra
    // request. This is not that: an unreadable ledger means the cap
    // cannot be enforced at all, and the thing it bounds is a bill from
    // two providers. Reporting the month as fully used is the honest
    // answer to "we do not know how much is left".
    return voiceAllowance(limitMinutes, minutesToSeconds(limitMinutes));
  }
}

export type ConsumeResult =
  | { ok: true; usedSeconds: number; remainingSeconds: number }
  | { ok: false; reason: "over_limit" | "error"; usedSeconds: number; remainingSeconds: number };

/**
 * Consume seconds against this month, or refuse.
 *
 * CALLED BEFORE THE PROVIDER, always. A cap enforced after the request
 * has already cost the money the cap exists to bound — and the whole
 * point of a monthly ceiling is that the month's last minute is refused
 * rather than billed and apologised for.
 *
 * The consequence, stated because it is a real trade-off: a provider
 * call that then FAILS has still consumed the seconds. That is the safe
 * direction — the alternative is consuming afterwards, which means a
 * request that succeeds but whose ledger write fails is free. Somebody
 * losing four seconds of a monthly allowance to a provider outage is a
 * smaller wrong than an uncapped feature.
 */
export async function consumeVoiceSeconds(
  admin: SupabaseClient,
  params: {
    userId: string;
    seconds: number;
    characters: number;
    limitMinutes: number;
    kind: "transcribe" | "speak";
  }
): Promise<ConsumeResult> {
  try {
    const { data, error } = await admin.rpc("consume_voice_seconds", {
      p_user_id: params.userId,
      p_seconds: Math.max(0, Math.ceil(params.seconds)),
      p_characters: Math.max(0, Math.ceil(params.characters)),
      p_limit_seconds: minutesToSeconds(params.limitMinutes),
      p_kind: params.kind,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    const used = Number(row?.used_seconds ?? 0);
    const remaining = Number(row?.remaining_seconds ?? 0);
    if (row?.allowed === true) return { ok: true, usedSeconds: used, remainingSeconds: remaining };
    return { ok: false, reason: "over_limit", usedSeconds: used, remainingSeconds: remaining };
  } catch (err) {
    logApiError("voice:consume", err, { userId: params.userId, kind: params.kind });
    // Fails closed, for the reason readVoiceUsage does.
    return { ok: false, reason: "error", usedSeconds: 0, remainingSeconds: 0 };
  }
}
