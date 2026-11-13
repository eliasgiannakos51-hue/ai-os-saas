import { resolvePricingConfig, type PricingConfig } from "@/lib/billing/pricing-config";
import { voiceCredits } from "@/lib/voice/voice-pricing";

/**
 * WHAT A MINUTE OF LIVE CONVERSATION COSTS, AND WHAT IT CHARGES (FS1,
 * the owner's «33. ΦΩΝΗΤΙΚΗ ΣΥΝΟΜΙΛΙΑ ΜΕ ΤΗ ΓΗ ΤΟΥ IONEXA», Κομμάτια 1
 * and 6).
 *
 * THE LIVE CONVERSATION IS A DIFFERENT PATH FROM THE HANDS-FREE LOOP in
 * components/voice/voice-conversation.tsx. That loop records a clip,
 * transcribes it, asks Chat, and synthesises the answer — three round
 * trips a turn. This one opens ONE realtime call from the browser to the
 * provider's speech-to-speech model (lib/voice/live-provider.ts), so the
 * answer starts while the person is still finishing the sentence and
 * speaking over it stops it. It is billed by the minute the call is open,
 * because the server never sees the audio and so cannot count anything
 * else it could trust.
 *
 * PURE AND CLIENT-SAFE, like lib/voice/voice-pricing.ts: the price is on
 * the screen before the call starts, and it has to be the same number
 * the server charges.
 */

/** The model the call is opened on. The cost below is the cost OF THIS
 *  model; changing one without the other is a charge computed for
 *  something we did not buy. */
export const LIVE_MODEL = "gpt-realtime-2.1-mini";

/** What transcribes the person's side, so the conversation can be kept
 *  as text. Billed by the provider on top of the realtime model. */
export const LIVE_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

/** One of the provider's own stock voices. Never a cloned one: FS1's
 *  «ΔΕΝ ΚΑΝΕΙ» is «ποτέ αντίγραφο φωνής πραγματικού ανθρώπου», and the
 *  session config in lib/voice/live-provider.ts sends this name and no
 *  custom voice id. */
export const LIVE_VOICE = "marin";

/**
 * LIST RATES, USD per 1M tokens, for LIVE_MODEL. Read 2026-11-11 from a
 * third-party table that says it was checked against OpenAI's own pricing
 * page on 2026-10-26 (cekura.ai/blogs/openai-realtime-api-pricing); the
 * official page itself could not be opened from the build machine. Kept
 * here so the estimate under it shows its working.
 */
export const LIVE_RATES_USD_PER_1M = {
  audioInput: 10,
  cachedAudioInput: 0.3,
  audioOutput: 20,
  textInput: 0.6,
  textOutput: 2.4,
} as const;

/**
 * THE COST BASIS: USD per minute the call is open.
 *
 * AN ESTIMATE, AND THE EXPENSIVE END OF IT. The provider bills tokens,
 * not minutes, and the server cannot see them (the audio goes browser to
 * provider). The same source measures this model at about $0.021 a minute
 * with prompt caching and about $0.05 without, on a five-minute, ten-turn
 * call; the person's side transcribed adds about $0.003. 0.06 is above
 * all of it. Cost per minute GROWS with the length of a call, because
 * every answer re-reads the conversation so far — which is what
 * LIVE_MAX_SESSION_MINUTES bounds.
 *
 * To be reconciled against the account's own OpenAI usage page after the
 * first real calls (docs/NEEDS-FROM-ELIAS.md). Until then the margin
 * proof in scripts/tests/voice-live.test.mjs is a proof against THIS
 * figure, and says so.
 */
export const LIVE_COST_USD_PER_MINUTE = 0.06;

/** Longest one call may run. A safety and a cost control at once: the
 *  per-minute cost climbs with history, and an open microphone nobody is
 *  speaking into should not stay open for an hour. The conversation is
 *  kept as text, so starting another one loses nothing. */
export const LIVE_MAX_SESSION_MINUTES = 15;

/** A minute is paid for BEFORE it starts. The browser asks for the next
 *  one this many seconds before the paid time runs out, so a slow
 *  request does not end a call mid-sentence. */
export const LIVE_TICK_LEAD_SECONDS = 12;

/** How long past its paid time a call may be seen open before the sweep
 *  (api/cron/voice-live-sweep) ends it. Covers a tick in flight. */
export const LIVE_GRACE_SECONDS = 20;

/** Credits one minute costs the person, by the one formula every other
 *  voice price here uses. */
export function liveCreditsPerMinute(config?: PricingConfig, marginMultiplier?: number): number {
  return voiceCredits(LIVE_COST_USD_PER_MINUTE, config ?? resolvePricingConfig(), marginMultiplier);
}

/** Minutes a call that ran `seconds` is billed for: every started minute,
 *  never fewer than one, never more than the cap. */
export function liveBillableMinutes(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 1;
  return Math.min(LIVE_MAX_SESSION_MINUTES, Math.max(1, Math.ceil(seconds / 60)));
}

/** Whether a call that has already had `minutesBilled` may have another. */
export function liveMayContinue(minutesBilled: number): boolean {
  return Number.isInteger(minutesBilled) && minutesBilled >= 0 && minutesBilled < LIVE_MAX_SESSION_MINUTES;
}

export type LiveTurn = { role: "user" | "assistant"; text: string };

/** The most a kept conversation may carry into Chat. */
export const LIVE_MAX_TURNS = 200;
export const LIVE_MAX_TURN_CHARS = 4000;

/**
 * What the browser hands back when the call ends, made safe to store: a
 * list of {role, text}, nothing else, bounded in count and length, empty
 * lines dropped. It is the person's own conversation going into their own
 * thread, so it is trusted no further than anything they could type —
 * and no less.
 */
export function cleanLiveTurns(value: unknown): LiveTurn[] {
  if (!Array.isArray(value)) return [];
  const out: LiveTurn[] = [];
  for (const raw of value) {
    if (out.length >= LIVE_MAX_TURNS) break;
    if (!raw || typeof raw !== "object") continue;
    const role = (raw as { role?: unknown }).role;
    const text = (raw as { text?: unknown }).text;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof text !== "string") continue;
    const clipped = text.trim().slice(0, LIVE_MAX_TURN_CHARS);
    if (!clipped) continue;
    out.push({ role, text: clipped });
  }
  return out;
}
