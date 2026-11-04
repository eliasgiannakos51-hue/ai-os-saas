import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * THE PAIRING OF ONE COMPUTER TO ONE ACCOUNT — the arithmetic half, with no
 * database and no request in it, so every rule below can be tested by
 * calling it (scripts/tests/iowork-pairing.test.mjs).
 *
 * The shape comes from §3 of the approved docs/IOWORK-SECURITY-PLAN.md: the
 * app shows an eight-character code, the person types it at ionexa.ai while
 * signed in, and the server answers with a device token that is good for
 * that one computer.
 *
 * WHY THE CODE IS NOT THE THING THAT FETCHES THE TOKEN. Eight characters a
 * person can read off a screen and retype is, by construction, low entropy
 * and visible to anyone standing nearby. So it does one job only: it proves
 * to the ACCOUNT that the person asking holds that computer. A second value
 * — claimSecret, 32 random bytes the app keeps and never displays — is what
 * actually collects the token. Someone who reads the code over a shoulder
 * can attach their own account to a pairing, which the app then shows by
 * name so it is visible; they cannot collect the token, because they do not
 * have the secret the app generated.
 */

/**
 * THE CODE ITSELF LIVES IN src/lib/pairing-code.ts, not here.
 *
 * It moved out on 2026-10-31, when Telegram (the owner's "24. IONEXA ΣΤΟ
 * TELEGRAM") needed the same eight characters running the other way —
 * ionexa.ai shows them, the person sends them to the bot. Two copies of a
 * Crockford alphabet are two statements that can disagree, and the one
 * that lost "no I, L, O, U" would keep passing its own tests.
 *
 * RE-EXPORTED RATHER THAN RE-IMPORTED BY EVERY CALLER so that every
 * `from "@/lib/iowork/pairing"` in the four api/iowork routes and the page
 * keeps naming one module, and so scripts/tests/iowork-pairing.test.mjs
 * still exercises this file's whole surface in one load.
 */
export {
  PAIRING_ALPHABET,
  PAIRING_CODE_LENGTH,
  newPairingCode,
  normalisePairingCode,
  formatPairingCode,
} from "@/lib/pairing-code";

/** Ten minutes: long enough to walk to the other machine, short enough that
 *  a guessed code has almost no window. With the limiter on the claim route
 *  the two together are the whole defence of a 32^8 space. */
export const PAIRING_TTL_MINUTES = 10;

/** §3: "expires by itself after 30 days without use". */
export const DEVICE_IDLE_DAYS = 30;

/** Not in the plan, added here: one account, a few computers. It bounds
 *  what a stolen account password can reach, and a person who really has
 *  six computers can disconnect one. */
export const MAX_DEVICES_PER_USER = 5;

/** 32 random bytes, base64url. Used for both the claim secret and the
 *  device token: neither is ever shown to a person, so neither needs to be
 *  readable. */
export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * SHA-256, hex. Deliberately not bcrypt or argon2, and the reason is the
 * input: these are 32 bytes from randomBytes, not a password someone chose.
 * A slow hash buys nothing against a value with 256 bits of entropy — there
 * is no dictionary to walk — and it would cost a slow comparison on a route
 * the desktop app polls.
 */
export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** True once the ten minutes are up. `now` is passed in so the rule can be
 *  tested without waiting for a clock. */
export function isPairingExpired(createdAt: string, now: number = Date.now()): boolean {
  const started = Date.parse(createdAt);
  if (!Number.isFinite(started)) return true; // unreadable date: refuse, never allow
  return now - started > PAIRING_TTL_MINUTES * 60 * 1000;
}

/** §3's thirty days. Same shape, same reason for taking `now`. */
export function isDeviceIdle(lastSeenAt: string, now: number = Date.now()): boolean {
  const seen = Date.parse(lastSeenAt);
  if (!Number.isFinite(seen)) return true;
  return now - seen > DEVICE_IDLE_DAYS * 24 * 60 * 60 * 1000;
}

/** The two platforms the plan names, and nothing else. */
export const IOWORK_PLATFORMS = ["mac", "windows"] as const;
export type IoworkPlatform = (typeof IOWORK_PLATFORMS)[number];

export function parsePlatform(value: unknown): IoworkPlatform | null {
  return typeof value === "string" && (IOWORK_PLATFORMS as readonly string[]).includes(value)
    ? (value as IoworkPlatform)
    : null;
}

/** A computer's name as the person will see it in the list. Whatever the
 *  app sends is treated as text to display, never as anything else, and it
 *  is bounded so one row cannot push the rest off the screen. */
export const MAX_DEVICE_LABEL_CHARS = 60;

/**
 * C0/C1 control characters, EXCLUDING tab/newline/carriage-return — those
 * three are left to the whitespace-collapse below, which turns them into a
 * single readable space rather than deleting them outright. Everything
 * else in this range (NUL, ESC, the rest) has no business in a label an
 * UNAUTHENTICATED caller supplies (api/iowork/pair has no session) and
 * that later shows up verbatim in the owner's own device list and, on a
 * failure, in logApiError's metadata.
 */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

export function parseDeviceLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value
    .replace(CONTROL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DEVICE_LABEL_CHARS);
  return trimmed.length > 0 ? trimmed : fallback;
}

/** A device id, as it appears in a DELETE URL — checked before it ever
 *  reaches a query. Without this, a non-UUID string reaches Postgres as a
 *  malformed uuid, which answers 500 rather than 404 and, through
 *  logApiError's metadata, writes whatever the caller sent into the
 *  owner's own error table. The shape only, not the version nibble: Postgres
 *  itself does not care which UUID version a column holds. */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function looksLikeUuid(value: string): boolean {
  return UUID_SHAPE.test(value);
}
