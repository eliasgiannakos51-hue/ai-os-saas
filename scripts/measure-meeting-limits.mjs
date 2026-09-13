#!/usr/bin/env node
/*
 * DOES A NINETY-MINUTE MEETING FIT? THE ARITHMETIC, BEFORE THE FEATURE.
 *
 * Asked on 2026-09-12, because "90 minutes" is a product decision and the
 * platform has three ceilings that do not care about it. Better 60 that
 * works than 90 that fails in the middle — so the numbers come first.
 *
 * EVERY CEILING IS READ OUT OF THE TREE, not typed here:
 *   the function timeout   from lib/function-limits.ts (Hobby's 60s)
 *   the request body cap   from api/files/register/route.ts, which is
 *                          where this project already wrote down why a
 *                          20MB file cannot travel through one
 *   the audio cap today    from lib/voice/voice-config.ts
 *   the per-minute price   from lib/voice/voice-pricing.ts
 *
 * The one number that is not in the tree is Whisper's own 25MB file cap,
 * which is OpenAI's published limit and is labelled as such below.
 *
 * Run: node scripts/measure-meeting-limits.mjs
 */
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
function need(src, re, what) {
  const m = src.match(re);
  if (!m) {
    console.error(`could not read ${what} — the constant moved and this would be a guess`);
    process.exit(1);
  }
  return m[1];
}

const HOBBY_SECONDS = Number(
  need(read("src/lib/function-limits.ts"), /HOBBY_MAX_DURATION_SECONDS = (\d+)/, "the Hobby timeout")
);
const BODY_MB = Number(
  need(read("src/app/api/files/register/route.ts"), /host caps request bodies at\n \* ~([\d.]+)MB/, "the request body cap")
);
const CLIP_SECONDS = Number(
  need(read("src/lib/voice/voice-pricing.ts"), /MAX_CLIP_SECONDS = (\d+)/, "today's clip ceiling")
);
const AUDIO_MB =
  Number(need(read("src/lib/voice/voice-config.ts"), /MAX_AUDIO_BYTES = (\d+) \* 1024 \* 1024/, "today's audio cap"));
const PER_MINUTE_USD = Number(
  need(read("src/lib/voice/voice-pricing.ts"), /transcribePerMinute: ([\d.]+)/, "the Whisper rate")
);

/** OpenAI's published cap on one transcription request. NOT from the tree. */
const WHISPER_FILE_MB = 25;
/** Whisper is roughly 10-20x faster than real time; the SLOWER end is the
 *  one a timeout has to survive. Estimated, and the estimate is the point. */
const WHISPER_SPEEDUP = 10;

const MB = 1024 * 1024;
const minutesAt = (mb, kbps) => (mb * MB * 8) / (kbps * 1000) / 60;
const wavMinutes = (mb, hz = 16000, bytesPerSample = 2) => (mb * MB) / (hz * bytesPerSample) / 60;

console.log("can a 90-minute meeting be transcribed? — ceilings read from the tree\n");
console.log(`  function timeout (Hobby)   ${HOBBY_SECONDS}s     lib/function-limits.ts`);
console.log(`  request body cap           ~${BODY_MB}MB   api/files/register/route.ts`);
console.log(`  audio cap today            ${AUDIO_MB}MB     lib/voice/voice-config.ts`);
console.log(`  clip cap today             ${CLIP_SECONDS}s    lib/voice/voice-pricing.ts`);
console.log(`  Whisper file cap           ${WHISPER_FILE_MB}MB    OpenAI's published limit, not from the tree`);
console.log(`  Whisper rate               $${PER_MINUTE_USD}/min\n`);

console.log("== 1. how much audio fits in ONE request body ==");
for (const kbps of [32, 64, 128]) {
  console.log(
    `  mp3 @ ${String(kbps).padStart(3)} kbps mono   ${minutesAt(BODY_MB, kbps).toFixed(1).padStart(5)} min in ${BODY_MB}MB   ${minutesAt(WHISPER_FILE_MB, kbps).toFixed(0).padStart(3)} min in Whisper's ${WHISPER_FILE_MB}MB`
  );
}
console.log(
  `  wav 16kHz mono 16-bit  ${wavMinutes(BODY_MB).toFixed(1).padStart(5)} min in ${BODY_MB}MB   ${wavMinutes(WHISPER_FILE_MB).toFixed(0).padStart(3)} min in Whisper's ${WHISPER_FILE_MB}MB`
);
console.log(`
  SO A NINETY-MINUTE FILE CANNOT TRAVEL THROUGH A REQUEST BODY. Not at any
  bitrate anybody records at: 90 minutes inside ${BODY_MB}MB is ${((BODY_MB * MB * 8) / (90 * 60) / 1000).toFixed(1)} kbps, which
  is below telephone speech. This is the same wall api/files/register was
  written about, and it is why /dashboard/files uploads to storage first.`);

console.log("\n== 2. how much audio fits in ONE function invocation ==");
const perCall = (HOBBY_SECONDS * WHISPER_SPEEDUP) / 60;
console.log(`  at ~${WHISPER_SPEEDUP}x real time, ${HOBBY_SECONDS}s of function time transcribes about ${perCall.toFixed(0)} minutes`);
console.log(`  — and that is the WHOLE budget: the upload, the provider round trip and the reply share it.`);
console.log(`  A safe working figure is half of it: ~${(perCall / 2).toFixed(0)} minutes per call.`);

console.log("\n== 3. so what actually fits, and at what price ==");
const CHUNK_MIN = 2;
for (const total of [15, 30, 60, 90]) {
  const chunks = Math.ceil(total / CHUNK_MIN);
  const wavMb = (total * 60 * 16000 * 2) / MB;
  const decodeMb = (total * 60 * 16000 * 4) / MB;
  const usd = total * PER_MINUTE_USD;
  console.log(
    `  ${String(total).padStart(3)} min: ${String(chunks).padStart(2)} x ${CHUNK_MIN}-min requests · $${usd.toFixed(2)} of Whisper · ` +
      `${wavMb.toFixed(0)}MB as 16kHz wav · ${decodeMb.toFixed(0)}MB to decode in the browser`
  );
}
console.log(`
  THE BROWSER IS THE REAL CEILING, not the platform. Slicing a recording
  into request-sized pieces means decoding it first, and decodeAudioData
  decodes the WHOLE file into Float32 — four bytes per sample per channel.
  Ninety minutes is ${((90 * 60 * 16000 * 4) / MB).toFixed(0)}MB of live memory before a single byte is sent,
  which a phone does not have. Thirty minutes is ${((30 * 60 * 16000 * 4) / MB).toFixed(0)}MB, which it does.`);
