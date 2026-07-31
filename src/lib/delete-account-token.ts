import "server-only";
import { randomBytes, createHash } from "crypto";

export const DELETE_ACCOUNT_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Raw token goes in the emailed link only — never stored. The DB only ever
// holds this SHA-256 hash, same reasoning as storing a password hash instead
// of the password itself: a leaked DB row can't be replayed as a working
// deletion link.
export function generateDeleteAccountToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashDeleteAccountToken(token) };
}

export function hashDeleteAccountToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
