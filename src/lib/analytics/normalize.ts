/**
 * WHAT THE FIRST-PARTY PAGE COUNTER IS ALLOWED TO STORE (2026-11-08).
 *
 * The counter (src/app/api/analytics/view/route.ts) keeps one number per
 * (day, page, source): "this page was viewed this many times today, coming
 * from there". These two functions decide what "page" and "there" can be.
 * Everything else a browser sends (query string, fragment, user agent, IP,
 * language, screen size) is dropped before it could be stored, because this
 * is the only place a value is turned into a stored value.
 *
 * WHY IT IS STRICT. A visited address can carry a person: /dashboard/files/
 * <uuid> names a document, /reset?token=... a credential, /u/jane a name.
 * A path is therefore stored only if every character is in a small safe set,
 * and a segment that looks like an identifier is collapsed to ":id" so the
 * counter keeps "a document page was viewed", never "this document was".
 * Anything that fails is dropped, not repaired.
 *
 * WHAT IT DOES NOT DO. It does not count people: with no cookie, no stored
 * identifier and no IP, two views by one person and one view each by two
 * people look the same. "Views" is the unit, not "visitors".
 */

export const MAX_PATH_LENGTH = 120;
export const MAX_SOURCE_LENGTH = 60;

/** Values the counter stores for a view that has no external origin. */
export const SOURCE_DIRECT = "direct";
export const SOURCE_INTERNAL = "internal";
export const SOURCE_OTHER = "other";

const SAFE_PATH = /^\/[A-Za-z0-9/_.-]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_DIGITS = /^\d{4,}$/;
const LONG_HEX = /^[0-9a-f]{16,}$/i;
/** A segment this long is a slug naming something (a site, a document), not a route. */
const MAX_SEGMENT_LENGTH = 40;

/** Pages whose address is never counted at all: the API, and anything under auth callbacks. */
const NEVER_COUNTED = [/^\/api(\/|$)/, /^\/auth(\/|$)/, /^\/_next(\/|$)/];

/**
 * A page address -> the form that may be stored, or null when it must not be.
 * The length limit applies to the form that would be STORED, after identifiers
 * collapse, so a long address made of identifiers is kept. Takes a pathname only: a value containing `?` or `#` is refused, not trimmed,
 * because a caller that sent one is not the caller this was written for.
 */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0) return null;
  if (!SAFE_PATH.test(raw)) return null;
  if (raw.includes("..") || raw.includes("//")) return null;
  if (NEVER_COUNTED.some((re) => re.test(raw))) return null;

  const segments = raw.split("/").filter((s) => s.length > 0);
  const collapsed = segments.map((s) => {
    if (UUID.test(s) || LONG_DIGITS.test(s) || LONG_HEX.test(s) || s.length > MAX_SEGMENT_LENGTH) return ":id";
    return s;
  });
  const out = "/" + collapsed.join("/");
  return out.length <= MAX_PATH_LENGTH ? out : null;
}

/** Hostnames only: lowercase letters, digits, dots, hyphens; at least one dot. */
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
/** A campaign tag the owner chose, e.g. ?utm_source=newsletter. */
const TAG = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/**
 * Where a view came from. `first` is true only for the view that opens the
 * visit (the browser's own referrer is meaningful only then); every later
 * view in the same visit is a click inside the product and counts as
 * "internal". `ref` is the referrer's HOST, already stripped of path and
 * query by the browser-side code, and is re-checked here anyway.
 */
export function normalizeSource(first: unknown, ref: unknown, utm: unknown): string {
  if (first !== true) return SOURCE_INTERNAL;
  if (typeof utm === "string") {
    const tag = utm.trim().toLowerCase();
    if (TAG.test(tag)) return `utm:${tag}`;
  }
  if (typeof ref !== "string" || ref.trim() === "") return SOURCE_DIRECT;
  const host = ref.trim().toLowerCase().replace(/^www\./, "");
  if (host.length > MAX_SOURCE_LENGTH || !HOST.test(host)) return SOURCE_OTHER;
  return host;
}
