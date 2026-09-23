import { MAX_FUNCTION_DURATION_SECONDS } from "@/lib/function-limits";

/**
 * HOW LONG A MEETING MAY BE — DERIVED, NOT CHOSEN.
 *
 * "Ninety minutes" is a product wish. The platform has three ceilings
 * that do not care about it, and `node scripts/measure-meeting-limits.mjs`
 * reads all three out of the tree rather than restating them:
 *
 *   the request body cap    ~4.5MB, the host's, before the route runs
 *   the function budget     lib/function-limits.ts, 60s or 800s by plan
 *   Whisper's file cap      25MB, OpenAI's published number
 *
 * THE BODY CAP IS THE ONE THAT BINDS, and it binds hard: ninety minutes
 * inside 4.5MB is 7 kbps, below telephone speech. So the answer is not
 * "ninety minutes at a lower bitrate" — it is that a meeting long enough
 * to need this feature does not travel through a request body at all.
 *
 * ---------------------------------------------------------------------
 * WHY THE AUDIO IS STILL SENT IN THE BODY ANYWAY
 * ---------------------------------------------------------------------
 *
 * The alternative is what /dashboard/files does: upload to storage, then
 * have the route read it back. That lifts the cap to Whisper's 25MB —
 * and it puts the recording of a room full of people, most of whom were
 * never asked, into a bucket.
 *
 * The promise this feature makes is that the audio is not stored. Through
 * storage that promise is a `finally` block, and a function killed at its
 * ceiling runs no `finally` — this repository already paid for that
 * lesson once (lib/function-limits.ts, "a function killed at 60s runs no
 * catch block"). Through the body it is not a promise at all: there is no
 * bucket, no column and no path, so there is nothing to leak and nothing
 * to clean up. A voice is a biometric identifier; what is not kept cannot
 * be taken.
 *
 * The cost of that choice is stated rather than hidden: a long meeting
 * has to be exported as a voice-grade file or split, and the refusal
 * message says so with both numbers in it.
 *
 * ---------------------------------------------------------------------
 * TWO CEILINGS, AND THEY FAIL DIFFERENTLY
 * ---------------------------------------------------------------------
 *
 * BYTES are exact. Both sides can measure them, so this is what the
 * server enforces and what a lying client cannot get around.
 *
 * SECONDS are what the user actually cares about, and the browser only
 * knows them because it asked an <audio> element. They bound the WORK —
 * transcription runs at roughly ten times real time, and the function
 * budget is what that has to fit inside.
 *
 * Both are checked on the client (so the message is good) and on the
 * server (so the check is real).
 */

/**
 * The host rejects a larger body itself, with an HTML 413 the client code
 * never sees — see api/files/register/route.ts, which was written about
 * exactly this. 4MB leaves room for the multipart envelope and the other
 * form fields so that OUR refusal is the one the user reads.
 */
export const MAX_MEETING_BYTES = 4 * 1024 * 1024;

/**
 * Whisper against wall-clock, at the SLOW end of what it does. The slow
 * end is the one a timeout has to survive; using the fast end here would
 * be optimism with a kill switch behind it.
 */
export const TRANSCRIBE_SPEEDUP = 10;

/**
 * How much of the function budget the transcription itself may claim.
 * The rest is the upload arriving, the provider round trip, the database
 * writes and the reply — none of which are free, and all of which are
 * inside the same invocation.
 */
export const TRANSCRIBE_BUDGET_SHARE = 0.5;

/**
 * A ceiling on the ceiling. On a Pro budget the arithmetic below allows
 * about sixty-six minutes, which no 4MB file will ever reach — but a
 * misconfigured MAX_FUNCTION_DURATION should not be able to produce a
 * number that reads like a promise the bytes cannot keep.
 */
export const MEETING_SECONDS_HARD_CAP = 60 * 60;

/**
 * The longest recording this deployment will accept, in seconds.
 *
 * Takes the budget as an argument so it can be tested without an
 * environment, and so the SERVER can pass its own — which matters,
 * because `process.env.MAX_FUNCTION_DURATION` is undefined in a browser
 * and a client that computed this itself would get the 800s default on a
 * 60s deployment and offer a limit the server then refuses.
 */
export function maxMeetingSeconds(
  budgetSeconds: number = MAX_FUNCTION_DURATION_SECONDS
): number {
  const usable = Math.max(1, budgetSeconds) * TRANSCRIBE_BUDGET_SHARE * TRANSCRIBE_SPEEDUP;
  return Math.max(60, Math.min(MEETING_SECONDS_HARD_CAP, Math.floor(usable)));
}

export type MeetingLimits = {
  maxBytes: number;
  maxSeconds: number;
};

/** What the server hands the browser. The browser never derives these. */
export function meetingLimits(
  budgetSeconds: number = MAX_FUNCTION_DURATION_SECONDS
): MeetingLimits {
  return { maxBytes: MAX_MEETING_BYTES, maxSeconds: maxMeetingSeconds(budgetSeconds) };
}

export type MeetingRejection =
  | { ok: true }
  | { ok: false; reason: "too_large"; actualBytes: number; allowedBytes: number }
  | { ok: false; reason: "too_long"; actualSeconds: number; allowedSeconds: number }
  | { ok: false; reason: "empty" };

/**
 * IT IS REFUSED, NEVER TRUNCATED.
 *
 * Half a meeting transcribed is worse than none: the summary reads as
 * complete, the actions from the second half are simply absent, and
 * nothing on the screen says which half is missing. A refusal is visible
 * and a user can act on it; a silent truncation is a decision taken on
 * their behalf about which of their colleagues gets ignored.
 *
 * Both numbers come back so the message can say what it is and what is
 * allowed — "too long" on its own tells somebody to guess.
 */
export function checkMeetingUpload(
  input: { bytes: number; seconds: number },
  limits: MeetingLimits
): MeetingRejection {
  if (!Number.isFinite(input.bytes) || input.bytes <= 0) return { ok: false, reason: "empty" };
  if (input.bytes > limits.maxBytes) {
    return {
      ok: false,
      reason: "too_large",
      actualBytes: Math.round(input.bytes),
      allowedBytes: limits.maxBytes,
    };
  }
  // A duration the browser could not read arrives as 0. That is not a
  // refusal on its own — the bytes already bound the work — so it passes
  // here and the route prices it from the bytes instead.
  const seconds = Number.isFinite(input.seconds) ? Math.ceil(input.seconds) : 0;
  if (seconds > limits.maxSeconds) {
    return {
      ok: false,
      reason: "too_long",
      actualSeconds: seconds,
      allowedSeconds: limits.maxSeconds,
    };
  }
  return { ok: true };
}

/**
 * Seconds to charge and to price when the browser reported none.
 *
 * Derived from the bytes at the bitrate a voice recording is actually
 * made at, so an unreadable duration costs the user roughly what it
 * should rather than nothing — a free path through the meter is a way
 * to use the feature for nothing, not a kindness.
 */
export const ASSUMED_VOICE_KBPS = 32;

export function secondsFromBytes(bytes: number): number {
  const bits = Math.max(0, bytes) * 8;
  return Math.max(1, Math.round(bits / (ASSUMED_VOICE_KBPS * 1000)));
}

/** What the file picker should offer, and what the route accepts. */
export const MEETING_AUDIO_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-m4a",
  "audio/m4a",
  "audio/aac",
] as const;

export function isMeetingAudioType(mime: string | null | undefined): boolean {
  if (!mime) return false;
  const bare = mime.split(";")[0].trim().toLowerCase();
  return (MEETING_AUDIO_TYPES as readonly string[]).includes(bare);
}

export type MeetingPrice = {
  /** Credits that do not depend on the length: the analysis's system
   *  prompt and its base output. */
  fixedCredits: number;
  /** Credits per minute: transcription, plus the part of the analysis
   *  that grows with the transcript. */
  perMinuteCredits: number;
};

/**
 * WHAT IT WILL COST, BEFORE THE FILE IS SENT — and both halves of it.
 *
 * Transcription is priced per SECOND with the provider and the analysis
 * per TOKEN, so a single number would have to pick one and round the
 * other away. Two coefficients keep the shape honest: an analysis has a
 * fixed cost (the rules in the prompt, the summary that gets written
 * whatever the length) and a part that grows with the transcript.
 *
 * It is an ESTIMATE and it is labelled as one on screen. What is charged
 * is always the settled figure from measured usage — the difference is
 * released, which is what makes it safe for this to be approximate.
 */
export function meetingCostCredits(price: MeetingPrice, seconds: number): number {
  const minutes = Math.max(0, seconds) / 60;
  return Math.max(1, Math.ceil(price.fixedCredits + price.perMinuteCredits * minutes));
}

/**
 * How many characters a minute of speech becomes.
 *
 * 150 words a minute is the usual figure for conversational speech and
 * about six characters a word with the space — so ~900. It is used ONLY
 * to size the estimate before the transcript exists; once it does, the
 * analysis route measures the real length.
 */
export const CHARS_PER_SPOKEN_MINUTE = 900;
