import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

// Encryption for third-party OAuth tokens.
//
// This is the one place in the product where a database read that leaks —
// a mis-scoped policy, a backup on someone's laptop, a support engineer
// with a SQL console — hands over the user's actual Gmail. Everything else
// we store is data the user typed into us. A Google access token is a key
// to a different building.
//
// So the tokens are encrypted with a key that is NOT in the database, and
// the failure mode is chosen deliberately: with no key configured, this
// module REFUSES to encrypt. Storing a token in plaintext because an
// environment variable was missing is not a degraded mode, it is the
// breach.
//
// AES-256-GCM, not CBC: GCM is authenticated, so a ciphertext that has
// been tampered with fails to decrypt instead of decrypting to garbage
// that some downstream code then sends to Google.

/** Bumped only if the scheme changes. Stored in the payload so old rows
 *  stay readable across a future migration. */
const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12; // 96 bits — the size GCM is specified for
const TAG_BYTES = 16;

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super(
      "INTEGRATION_ENCRYPTION_KEY is not configured. Refusing to handle third-party tokens without it."
    );
    this.name = "MissingEncryptionKeyError";
  }
}

export class DecryptionFailedError extends Error {
  constructor(reason: string) {
    // Deliberately vague: this message can reach a log, and "the tag did
    // not verify for user X's gmail token" is more than a log line needs.
    super(`Could not decrypt a stored secret (${reason}).`);
    this.name = "DecryptionFailedError";
  }
}

/**
 * Parses the configured key.
 *
 * Accepts 64 hex characters or 44-character standard base64 — both are
 * exactly 32 bytes, and both are what a person gets from the two commands
 * a README would tell them to run. Anything else is REJECTED rather than
 * hashed into shape: silently accepting "changeme" by running it through
 * SHA-256 produces a perfectly valid-looking 32-byte key with about 40
 * bits of real entropy, and nothing would ever say so.
 *
 * Exported for testing against explicit inputs; application code uses
 * resolveKey().
 */
export function parseEncryptionKey(raw: string | undefined | null): Buffer {
  const value = (raw ?? "").trim();
  if (!value) throw new MissingEncryptionKeyError();

  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }
  if (/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    const buf = Buffer.from(value, "base64");
    if (buf.length === KEY_BYTES) return buf;
  }
  // base64url, since that is what `openssl rand -base64 32 | tr '+/' '-_'`
  // and most secret managers produce.
  if (/^[A-Za-z0-9_-]{43}$/.test(value)) {
    const buf = Buffer.from(value, "base64url");
    if (buf.length === KEY_BYTES) return buf;
  }

  throw new Error(
    "INTEGRATION_ENCRYPTION_KEY must be exactly 32 bytes, as 64 hex characters or base64. Generate one with: openssl rand -hex 32"
  );
}

let cachedKey: Buffer | null = null;

function resolveKey(): Buffer {
  if (cachedKey) return cachedKey;
  cachedKey = parseEncryptionKey(process.env.INTEGRATION_ENCRYPTION_KEY);
  return cachedKey;
}

/** True when tokens can be handled at all. Read by the UI so a
 *  misconfigured deployment says "integrations are unavailable" instead of
 *  failing halfway through an OAuth redirect. */
export function encryptionAvailable(): boolean {
  try {
    resolveKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypts one secret.
 *
 * `context` is bound into the ciphertext as GCM additional authenticated
 * data. It is not secret and it is not stored — it is reconstructed at
 * decryption time from the row. Its job is to make a ciphertext
 * non-transferable: a refresh token copied from one user's row into
 * another's, or from the refresh column into the access column, fails to
 * decrypt instead of quietly working. Without AAD, a database write
 * primitive becomes an account-takeover primitive.
 *
 * Format: v1.<iv>.<tag>.<ciphertext>, all base64url. Dot-separated because
 * base64url contains no dots, so parsing can never be ambiguous.
 */
export function encryptSecret(plaintext: string, context: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("Refusing to encrypt an empty secret.");
  }
  const key = resolveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string, context: string): string {
  const key = resolveKey();
  const parts = String(payload ?? "").split(".");
  if (parts.length !== 4) throw new DecryptionFailedError("malformed payload");

  const [version, ivB64, tagB64, dataB64] = parts;
  if (version !== VERSION) throw new DecryptionFailedError("unknown version");

  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const data = Buffer.from(dataB64, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new DecryptionFailedError("bad iv or tag length");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    // Covers both a wrong key and a tampered/replayed ciphertext. The
    // caller cannot tell them apart, and should not need to: either way
    // the stored token is unusable and the integration must be
    // reconnected.
    throw new DecryptionFailedError("authentication failed");
  }
}

/**
 * The AAD string for a token column.
 *
 * Built from the two things that must not be swapped — WHOSE token it is
 * and WHICH token it is — so both are cryptographically bound to the
 * ciphertext rather than merely being adjacent columns in a row.
 */
export function tokenContext(userId: string, provider: string, kind: "access" | "refresh"): string {
  return `ionexa:integration:${provider}:${kind}:${userId}`;
}

// ---------------------------------------------------------------------
// Log safety.
// ---------------------------------------------------------------------
//
// The rule for this feature is that a token never appears in a log line,
// an error message, or an API response. That rule is only as good as the
// weakest call site, so the redaction lives here and the OAuth code paths
// route every error through it.

const SECRET_KEY_NAMES =
  /(access_token|refresh_token|id_token|client_secret|authorization|code_verifier|"code"|token)/i;

/**
 * Strips anything that looks like a credential out of a value before it is
 * logged. Conservative: when a string looks token-shaped it is replaced
 * wholesale rather than partially masked, because a partial mask of a
 * short-lived token is still most of a token.
 */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[redacted: too deep]";
  if (typeof value === "string") {
    // A long opaque run of token-ish characters. Google access tokens
    // start "ya29.", Slack's "xoxb-"/"xoxp-", and JWTs are three dot-
    // separated base64url segments.
    if (/^(ya29\.|xox[bpaser]-|gho_|ghp_)/.test(value)) return "[redacted]";
    if (/^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(value)) return "[redacted jwt]";
    return value.length > 512 ? `${value.slice(0, 64)}…[truncated]` : value;
  }
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_NAMES.test(k) ? "[redacted]" : redactSecrets(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * An error, reduced to something that is safe to put in a log line.
 *
 * logApiError's context is Record<string, string|number|boolean|null>, so
 * redactSecrets' `unknown` return cannot be passed to it directly — and
 * casting it would defeat the point. This is the typed bridge: it returns
 * a STRING, so whatever the provider sent back cannot smuggle a token
 * through as a nested object value.
 *
 * Provider SDK errors routinely carry the request that produced them, and
 * that request carried a bearer token. This is the only shape allowed to
 * cross into a log.
 */
export function safeErrorDetail(err: unknown): string {
  if (err instanceof Error) {
    const redacted = redactSecrets(err.message);
    return typeof redacted === "string" ? redacted.slice(0, 300) : "[redacted]";
  }
  if (typeof err === "string") {
    const redacted = redactSecrets(err);
    return typeof redacted === "string" ? redacted.slice(0, 300) : "[redacted]";
  }
  // An object of unknown provenance is never stringified into a log: that
  // is exactly how a token-exchange response body ends up in stderr.
  return "[non-error value withheld]";
}

/** Constant-time string compare, for OAuth state/nonce checks. */
export function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a ?? ""), "utf8");
  const bufB = Buffer.from(String(b ?? ""), "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Test seam — lets a test swap the key without touching process.env. */
export function __setEncryptionKeyForTest(key: Buffer | null): void {
  cachedKey = key;
}
