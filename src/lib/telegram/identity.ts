import "server-only";
import { createHmac } from "node:crypto";
import { parseEncryptionKey } from "@/lib/integrations/crypto";

/**
 * A TELEGRAM CHAT ID, IN THE ONE SHAPE A DATABASE MAY HOLD IT SEARCHABLY.
 *
 * The webhook (κομμάτι 2) receives a chat id from Telegram and has to
 * answer "whose account is this?". That is a lookup BY chat id, so the
 * column it looks in has to be deterministic — which rules out the
 * AES-GCM ciphertext that public.notification_channels stores, whose fresh
 * iv makes the same chat id encrypt differently every time (that is
 * exactly what makes it safe and exactly what makes it unsearchable).
 *
 * WHY THIS IS KEYED AND NOT sha256(chatId). A Telegram user id is a
 * decimal integer, and Telegram's own documented bound puts it inside 52
 * bits with every real account today well under 2^34. So the whole space
 * of plausible ids can be hashed on one laptop in minutes: a column of
 * bare SHA-256 digests IS the column of chat ids, to anybody holding a
 * copy of the database. There is no salt available either — a per-row salt
 * would destroy the lookup this column exists for.
 *
 * A keyed HMAC is the standard answer to exactly that shape (a "blind
 * index"): deterministic enough to look up, and useless without the key.
 *
 * WHERE THE KEY COMES FROM, and why no new secret was asked for. The key
 * is DERIVED from INTEGRATION_ENCRYPTION_KEY — already in the environment,
 * already the one secret this product keeps out of its own database — by
 * HMAC'ing a fixed label with it. That is the cheap HKDF-expand of one
 * block, and its point is separation: the value used here is not the value
 * used to encrypt tokens, so this module cannot be turned into an oracle
 * for that key and a future change to either one does not quietly change
 * the other.
 *
 * NO KEY MEANS NO FEATURE, never a plaintext fallback. parseEncryptionKey
 * throws on a missing or malformed key, and both callers of this module
 * let that throw: a Telegram link stored in a shape the product did not
 * promise is not a degraded mode, it is the thing the promise was about.
 * /dashboard/integrations asks encryptionAvailable() first and does not
 * offer the connection at all when the answer is no — the same thing the
 * OAuth cards already do.
 */

/** The label that separates this use of the key from token encryption. The
 *  version is in it so a future scheme can be told from this one in a
 *  column holding both. */
const FINGERPRINT_LABEL = "ionexa/telegram/chat-id/v1";

/** Derived once per process. Not exported: the only thing anything outside
 *  this file needs is the fingerprint. */
let derived: Buffer | null = null;

function subKey(): Buffer {
  if (derived) return derived;
  const root = parseEncryptionKey(process.env.INTEGRATION_ENCRYPTION_KEY);
  derived = createHmac("sha256", root).update(FINGERPRINT_LABEL).digest();
  return derived;
}

/**
 * The value stored in telegram_links.chat_id_fingerprint and looked up by
 * the webhook. Hex, 64 characters, stable for one chat id for as long as
 * INTEGRATION_ENCRYPTION_KEY does not change.
 *
 * The id is stringified first and trimmed: Telegram sends it as a JSON
 * number, every caller here has it as a string, and `String(-100123)` and
 * `"-100123"` must not fingerprint differently or the same chat would read
 * as two.
 */
export function chatIdFingerprint(chatId: string | number): string {
  const normalised = String(chatId).trim();
  if (normalised.length === 0) throw new Error("chatIdFingerprint: empty chat id");
  return createHmac("sha256", subKey()).update(normalised).digest("hex");
}

/** For tests that need the derivation reset between two different keys. */
export function __resetTelegramKeyForTest(): void {
  derived = null;
}
