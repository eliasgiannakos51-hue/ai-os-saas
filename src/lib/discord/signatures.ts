import { createHmac, createPublicKey, timingSafeEqual, verify } from "node:crypto";

/**
 * THE TWO PROOFS DISCORD'S ROUTES ASK FOR (the owner's Discord directive,
 * 2026-11-05). Both pure, both held by scripts/tests/discord-bot.test.mjs.
 *
 * 1. THE CONNECT'S STATE, BOUND TO THE PERSON. The same shape as
 *    api/github/connect and api/github/callback: an HMAC over
 *    {nonce, user, time}, keyed with DISCORD_CLIENT_SECRET, ten minutes
 *    long, and the nonce ALSO in an httpOnly cookie. The callback accepts
 *    it only when the signature is right, the user in it is the session's
 *    user, it is not stale, and the cookie's nonce equals the state's —
 *    compared in constant time, so a server installed from someone else's
 *    link lands on nobody's account.
 *
 * 2. AN INTERACTION FROM DISCORD. Discord signs every request to the
 *    Interactions Endpoint with Ed25519 over timestamp + raw body
 *    (https://discord.com/developers/docs/interactions/overview), and the
 *    app's public key is DISCORD_PUBLIC_KEY, 64 hex characters. Verified
 *    with node's crypto.verify — no library. A missing header, a bad hex,
 *    a wrong signature or a timestamp more than five minutes from now is a
 *    refusal; Discord itself sends a bad signature when the endpoint is
 *    saved, and refuses the URL unless it is answered with 401.
 */

/** The httpOnly cookie that carries the nonce, scoped to /api/discord. */
export const DISCORD_STATE_COOKIE = "ionexa_discord_oauth";
export const STATE_TTL_MS = 10 * 60 * 1000;
export const INTERACTION_SKEW_S = 5 * 60;

export type StatePayload = { n: string; u: string; t: number };

export function signState(payload: StatePayload, secret: string): string {
  const json = JSON.stringify(payload);
  const sig = createHmac("sha256", secret).update(json).digest("base64url");
  return `${Buffer.from(json).toString("base64url")}.${sig}`;
}

export type StateCheck = { ok: true; payload: StatePayload } | { ok: false; reason: "malformed" | "invalid_signature" | "expired" | "wrong_user" | "wrong_cookie" };

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function verifyState(raw: string, opts: { secret: string; userId: string; cookieNonce: string | null | undefined; now?: number }): StateCheck {
  if (!opts.secret) return { ok: false, reason: "invalid_signature" };
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return { ok: false, reason: "malformed" };
  let json: string;
  try {
    json = Buffer.from(raw.slice(0, dot), "base64url").toString("utf8");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const expected = createHmac("sha256", opts.secret).update(json).digest("base64url");
  if (!sameText(raw.slice(dot + 1), expected)) return { ok: false, reason: "invalid_signature" };
  let p: Partial<StatePayload>;
  try {
    p = JSON.parse(json) as Partial<StatePayload>;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof p.n !== "string" || typeof p.u !== "string" || typeof p.t !== "number") return { ok: false, reason: "malformed" };
  if ((opts.now ?? Date.now()) - p.t > STATE_TTL_MS || p.t > (opts.now ?? Date.now()) + 60_000) return { ok: false, reason: "expired" };
  if (!sameText(p.u, opts.userId)) return { ok: false, reason: "wrong_user" };
  if (!opts.cookieNonce || !sameText(p.n, opts.cookieNonce)) return { ok: false, reason: "wrong_cookie" };
  return { ok: true, payload: { n: p.n, u: p.u, t: p.t } };
}

// The DER prefix that turns a raw 32-byte Ed25519 key into SPKI (RFC 8410).
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifyInteraction(opts: {
  publicKeyHex: string | undefined;
  signatureHex: string | null;
  timestamp: string | null;
  rawBody: string;
  nowSeconds?: number;
}): boolean {
  const { publicKeyHex, signatureHex, timestamp, rawBody } = opts;
  if (!publicKeyHex || !/^[0-9a-fA-F]{64}$/.test(publicKeyHex)) return false;
  if (!signatureHex || !/^[0-9a-fA-F]{128}$/.test(signatureHex)) return false;
  if (!timestamp || !/^\d{1,12}$/.test(timestamp)) return false;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > INTERACTION_SKEW_S) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]), format: "der", type: "spki" });
    return verify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}
