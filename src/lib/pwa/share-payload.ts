/**
 * What the OS hands us when someone shares INTO Ionexa, and how it
 * reaches the page that will use it.
 *
 * The Web Share Target API delivers a share as a real form POST from the
 * operating system. Files are easy — they go to the Files workspace. Text
 * is the awkward half: it has to survive a redirect and arrive at Create
 * Studio, and the three obvious ways to carry it are all worse than the
 * one used here.
 *
 *   A query string puts the user's shared text into the server's access
 *   logs and into their history, for content we have no reason to read.
 *   A cookie is capped at 4KB and has to be cleared by something.
 *   Server-side scratch storage is a table to write, expire and secure.
 *
 * A URL FRAGMENT is none of those: it is never sent to the server, the
 * client reads it on mount and immediately replaces the history entry, so
 * it exists only in the tab that is about to use it.
 *
 * Pure and browser-safe on both sides — the route encodes, the component
 * decodes, and the tests call both.
 */

export type SharedPayload = {
  title?: string;
  text?: string;
  url?: string;
};

/** The fragment key: /dashboard/create#share=<encoded> */
export const SHARE_HASH_KEY = "share";

/**
 * A shared text is a message someone is about to ask Ionexa about, not a
 * document. Well past anything a share sheet sends, and far below the
 * 20,000 characters a question may carry.
 */
export const MAX_SHARED_TEXT = 8000;

/**
 * Turns the three fields a share sheet sends into the one sentence Create
 * Studio takes.
 *
 * Android sends a shared link in `url`; iOS and several apps send the same
 * link inside `text` instead, and some send BOTH. Appending blindly gives
 * the user their own URL twice, so anything already present in the text is
 * not repeated — the same reason `title` is dropped when the text already
 * says it.
 */
export function composeSharedText(payload: SharedPayload): string {
  const text = (payload.text ?? "").trim();
  const title = (payload.title ?? "").trim();
  const url = (payload.url ?? "").trim();

  const parts: string[] = [];
  if (title && !text.includes(title)) parts.push(title);
  if (text) parts.push(text);
  if (url && !text.includes(url) && !title.includes(url)) parts.push(url);

  return parts.join("\n").trim().slice(0, MAX_SHARED_TEXT);
}

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): string | null {
  try {
    const padded = input.replace(/-/g, "+").replace(/_/g, "/");
    const binary = globalThis.atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from([...binary].map((c) => c.charCodeAt(0)));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * base64url, not encodeURIComponent.
 *
 * Shared text routinely contains `#` (a hashtag) and `&`. Percent-encoding
 * survives those, but only if every layer between here and `location.hash`
 * decodes exactly once — and browsers do not agree on whether `hash`
 * returns the raw or decoded form. base64url has no character that can
 * terminate a fragment, so there is no layer left to disagree.
 */
export function encodeSharePayload(payload: SharedPayload): string {
  return toBase64Url(JSON.stringify(payload));
}

export function decodeSharePayload(encoded: string): SharedPayload | null {
  const json = fromBase64Url(encoded);
  if (json === null) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const p = parsed as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
    return { title: str(p.title), text: str(p.text), url: str(p.url) };
  } catch {
    return null;
  }
}

/**
 * Reads a share out of a location hash. Returns the composed text, or null
 * when there is no share there — including for a hash that is present but
 * corrupt, which must be ignored rather than shown to the user as content.
 */
export function readSharedTextFromHash(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const encoded = params.get(SHARE_HASH_KEY);
  if (!encoded) return null;
  const payload = decodeSharePayload(encoded);
  if (!payload) return null;
  const text = composeSharedText(payload);
  return text.length > 0 ? text : null;
}
