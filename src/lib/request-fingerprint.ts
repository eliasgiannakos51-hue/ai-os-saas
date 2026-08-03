import crypto from "crypto";

// Pure, no I/O — kept out of ai-circuit-breaker.ts (which is "server-only"
// since it touches the admin Supabase client) specifically so this one
// piece stays directly unit-testable without a request/server context.
// A stable, short fingerprint of "what this request actually is" — used
// only to detect the SAME action being repeated, never stored or shown
// anywhere, so hashing (rather than keeping the raw text) is simply the
// cheapest way to get a fixed-size, comparison-safe identifier.
export function fingerprintRequest(...parts: (string | number | null | undefined)[]): string {
  const normalized = parts.map((p) => (p === null || p === undefined ? "" : String(p))).join(" ");
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}
