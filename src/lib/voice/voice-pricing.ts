import type { PlanSlug } from "@/lib/billing/plans";
import { PLANS } from "@/lib/billing/plans";
import { resolvePricingConfig, type PricingConfig } from "@/lib/billing/pricing-config";
import { usdToEur, creditsForRealCostEur } from "@/lib/billing/credit-formula";

/**
 * WHAT VOICE COSTS, AND WHAT IT CHARGES.
 *
 * TWO PROVIDERS THAT ARE NOT ANTHROPIC, and that is the whole reason this
 * file exists. Every other priced thing in this app is billed in tokens
 * and priced by lib/billing/model-pricing.ts. Speech is billed in
 * SECONDS OF AUDIO (transcription) and CHARACTERS OF TEXT (speech), so
 * the token path cannot price it and pretending otherwise would produce
 * a confident wrong number.
 *
 * WHAT DOES NOT CHANGE is the formula. The real cost is computed here in
 * USD, converted to EUR by the same rate, and turned into credits by
 * creditsForRealCostEur — the one function with the margin proof in its
 * header. So a voice minute is charged exactly the way a website
 * generation is: measured cost, times the multiplier, rounded up.
 *
 * PURE AND CLIENT-SAFE. The mic button shows a per-minute figure before
 * anybody presses it, and that figure has to come from the same numbers
 * the server settles against.
 */

/** Which provider a unit of voice work went to. Stored on the cost row,
 *  so an invoice can be reconciled against ours. */
export const VOICE_PROVIDERS = ["openai", "elevenlabs"] as const;
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];

/**
 * PUBLISHED LIST RATES, in USD, as of this file being written.
 *
 * WRITTEN DOWN RATHER THAN GUESSED, and stated as list prices rather
 * than as "what we pay" — a negotiated rate would make the margin LARGER
 * than proven, which is the safe direction. If a provider raises a rate,
 * this is the one place to change and the margin proof in
 * scripts/tests/voice.test.mjs re-runs against the new number.
 *
 * TRANSCRIPTION is per minute of audio, billed by OpenAI in seconds and
 * rounded to the nearest second.
 * SPEECH is per 1,000 characters of input text.
 */
export const VOICE_RATES_USD = {
  /** OpenAI Whisper (whisper-1): $0.006 per minute. */
  transcribePerMinute: 0.006,
  /** ElevenLabs on a paid tier: about $0.15 per 1,000 characters at the
   *  Creator rate. Deliberately the EXPENSIVE end of the published range
   *  — pricing against the cheapest tier would make the margin depend on
   *  a subscription somebody has to remember to keep. */
  speakPer1kChars: 0.15,
} as const;

/** What the routes ask each provider for. Named here because the cost
 *  above is the cost OF THESE, and a model swap that skips this file is
 *  a charge computed for something we did not buy. */
export const VOICE_MODELS = {
  transcribe: "whisper-1",
  /** ElevenLabs' low-latency model — the conversation loop's budget is
   *  1.5 seconds end to end, and their flagship model does not fit in
   *  it. */
  speak: "eleven_turbo_v2_5",
} as const;

/**
 * Longest single recording, in seconds.
 *
 * NOT A COST CONTROL — the per-plan minute cap is that. This is a
 * SAFETY control: a tab left recording because a click never registered
 * would otherwise stream a user's room to a transcription API until the
 * browser was closed, and the first they would know is the bill. Two
 * minutes is longer than anybody dictates in one breath.
 */
export const MAX_CLIP_SECONDS = 120;

/** Longest text one speak request may carry. Beyond this the player
 *  reads in parts, so a long research report does not become one
 *  ten-minute request that cannot be paused for ten minutes. */
export const MAX_SPEAK_CHARS = 2500;

export function transcribeCostUsd(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return (seconds / 60) * VOICE_RATES_USD.transcribePerMinute;
}

export function speakCostUsd(characters: number): number {
  if (!Number.isFinite(characters) || characters <= 0) return 0;
  return (characters / 1000) * VOICE_RATES_USD.speakPer1kChars;
}

/**
 * Credits for one piece of voice work.
 *
 * `marginMultiplier` is the resolved per-feature/per-plan margin from
 * lib/billing/margin-policy.ts. Omitted, the general configured one is
 * used — the same contract every other credits function here has.
 */
export function voiceCredits(
  usdCost: number,
  config?: PricingConfig,
  marginMultiplier?: number
): number {
  const c = config ?? resolvePricingConfig();
  return creditsForRealCostEur(usdToEur(usdCost, c), c, marginMultiplier);
}

/**
 * What a MINUTE of each kind costs the user, for the label beside the
 * mic and the "Listen" button.
 *
 * Speech has no minutes — it has characters — so a minute of it is
 * quoted at a speaking rate. 150 words a minute at 5.5 characters a word
 * is ~825 characters; 900 is the round number just above it, so the
 * quote leans high rather than low. A quote that turns out to be an
 * under-estimate is the one people remember.
 */
export const SPOKEN_CHARS_PER_MINUTE = 900;

export function creditsPerVoiceMinute(
  kind: "transcribe" | "speak",
  config?: PricingConfig,
  marginMultiplier?: number
): number {
  const usd =
    kind === "transcribe" ? transcribeCostUsd(60) : speakCostUsd(SPOKEN_CHARS_PER_MINUTE);
  return voiceCredits(usd, config, marginMultiplier);
}

/**
 * MINUTES PER MONTH, PER PLAN.
 *
 * A CAPACITY LIMIT, NOT A FREE QUOTA — every one of these minutes is
 * charged in credits, exactly like an agent RUN is charged while
 * DEFAULT_AGENT_LIMITS caps how many agents may exist. It is registered
 * as such in scripts/tests/combined-ceiling.test.mjs, and the distinction
 * matters: a free quota spends real money outside the credit ceiling and
 * has to be declared in lib/billing/free-allowances.ts. This does not.
 *
 * SO WHY CAP IT AT ALL. Two reasons that are not about our margin:
 *
 *   A RUNAWAY IS SILENT. A stuck recorder, a script, a tab that never
 *   closed — voice is the only feature in this product that can consume
 *   without anybody typing. The per-clip ceiling above bounds one
 *   recording; this bounds a month.
 *
 *   THE PROVIDERS HAVE THEIR OWN LIMITS. An account that could spend its
 *   whole credit balance on speech would hit ElevenLabs' quota for the
 *   entire platform, taking voice down for everybody else. A per-account
 *   ceiling is what stops one account doing that.
 *
 * Free is 0: voice needs a paid provider on both ends, and a free tier
 * that offers it is a free tier that costs real money per signup.
 */
export const DEFAULT_VOICE_MINUTE_LIMITS: Record<PlanSlug, number> = PLANS.reduce(
  (acc, plan) => {
    acc[plan.slug] = {
      free: 0,
      starter: 30,
      growth: 90,
      professional: 300,
      ultimate: 900,
      enterprise: 2000,
    }[plan.slug];
    return acc;
  },
  {} as Record<PlanSlug, number>
);

export const VOICE_LIMIT_ENV_VARS: Record<PlanSlug, string> = {
  free: "VOICE_MINUTES_FREE",
  starter: "VOICE_MINUTES_STARTER",
  growth: "VOICE_MINUTES_GROWTH",
  professional: "VOICE_MINUTES_PROFESSIONAL",
  ultimate: "VOICE_MINUTES_ULTIMATE",
  enterprise: "VOICE_MINUTES_ENTERPRISE",
};

/** A cap this large is a typo, and honouring it removes the protection
 *  the cap exists for — so it is refused rather than clamped, exactly as
 *  MAX_SANE_AGENT_LIMIT is. */
const MAX_SANE_VOICE_MINUTES = 100_000;

export type VoiceLimitWarning = { plan: PlanSlug; envVar: string; value: string; reason: string };

export function parseVoiceMinuteLimits(env: Record<string, string | undefined>): {
  limits: Record<PlanSlug, number>;
  warnings: VoiceLimitWarning[];
} {
  const warnings: VoiceLimitWarning[] = [];
  const limits = { ...DEFAULT_VOICE_MINUTE_LIMITS };

  for (const slug of Object.keys(DEFAULT_VOICE_MINUTE_LIMITS) as PlanSlug[]) {
    const raw = env[VOICE_LIMIT_ENV_VARS[slug]];
    if (raw === undefined || raw.trim() === "") continue;
    const parsed = Number(raw.trim());
    if (!Number.isInteger(parsed) || parsed < 0) {
      warnings.push({ plan: slug, envVar: VOICE_LIMIT_ENV_VARS[slug], value: raw, reason: "not a non-negative integer" });
      continue;
    }
    if (parsed > MAX_SANE_VOICE_MINUTES) {
      warnings.push({ plan: slug, envVar: VOICE_LIMIT_ENV_VARS[slug], value: raw, reason: `above the sane ceiling of ${MAX_SANE_VOICE_MINUTES}` });
      continue;
    }
    limits[slug] = parsed;
  }
  return { limits, warnings };
}

export function voiceMinutesForPlan(
  planSlug: PlanSlug,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): number {
  return parseVoiceMinuteLimits(env).limits[planSlug] ?? 0;
}

/**
 * SECONDS ARE THE UNIT THAT IS COUNTED, minutes are the unit that is
 * SHOWN. Counting in minutes would round every four-second correction up
 * to one, and thirty of those would exhaust a Starter month on two
 * minutes of speech.
 */
export function minutesToSeconds(minutes: number): number {
  return Math.max(0, Math.floor(minutes * 60));
}

export function secondsToMinutes(seconds: number): number {
  return Math.max(0, seconds) / 60;
}

/** Characters of synthesised speech, counted against the same monthly
 *  budget as recorded seconds — so "minutes of voice" is one number a
 *  person can hold, not two. Converted at the speaking rate above. */
export function speakCharsToSeconds(characters: number): number {
  if (!Number.isFinite(characters) || characters <= 0) return 0;
  return Math.ceil((characters / SPOKEN_CHARS_PER_MINUTE) * 60);
}

export type VoiceAllowance = {
  limitMinutes: number;
  usedSeconds: number;
  remainingSeconds: number;
  /** False when this plan does not include voice at all, which is a
   *  different sentence from "you have used it up". */
  included: boolean;
};

export function voiceAllowance(limitMinutes: number, usedSeconds: number): VoiceAllowance {
  const limitSeconds = minutesToSeconds(limitMinutes);
  return {
    limitMinutes,
    usedSeconds: Math.max(0, usedSeconds),
    remainingSeconds: Math.max(0, limitSeconds - Math.max(0, usedSeconds)),
    included: limitMinutes > 0,
  };
}

/** Whether a piece of work fits in what is left. Checked BEFORE the
 *  provider is called, because a refusal after the call has already cost
 *  the money the cap exists to bound. */
export function fitsInAllowance(allowance: VoiceAllowance, seconds: number): boolean {
  if (!allowance.included) return false;
  return seconds > 0 && seconds <= allowance.remainingSeconds;
}
