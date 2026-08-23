/**
 * The one href a navigation event is allowed to record, and the one flag
 * that turns the whole thing off.
 *
 * No "server-only" import: the opt-out key and the href validator are
 * both needed on the client (the sidebar skips the request when the
 * account has opted out; the API route rejects anything the validator
 * refuses). Nothing here touches a database or a secret.
 */

/**
 * user_metadata flag. OPT-OUT, not opt-in, and named for what it does.
 *
 * Absent or false means events are recorded. That is the honest default
 * for telemetry this narrow — a page path and a timestamp, deleted after
 * 90 days, visible in the user's own export — and it is the only default
 * under which the numbers mean anything: an opt-IN sample is a sample of
 * people who opt in, which is exactly the population whose behaviour
 * differs from everyone else's.
 *
 * The switch is in Settings, one click, no confirmation dialog.
 */
export const NAV_ANALYTICS_OPT_OUT_KEY = "nav_analytics_opt_out";

export function hasOptedOutOfNavAnalytics(userMetadata: unknown): boolean {
  if (typeof userMetadata !== "object" || userMetadata === null) return false;
  return (userMetadata as Record<string, unknown>)[NAV_ANALYTICS_OPT_OUT_KEY] === true;
}

/** Longest path we will store. Nothing legitimate comes close. */
export const MAX_HREF_LENGTH = 128;

/**
 * WHAT COUNTS AS A RECORDABLE href — and why this is a security boundary
 * rather than tidiness.
 *
 * The table is meant to hold PAGE IDENTITIES: "/dashboard/agents". It is
 * not meant to hold what the user was looking for or which record they
 * opened. Without this check, three things leak into a telemetry table
 * that nobody would ever agree to put there on purpose:
 *
 *   /dashboard/timeline?module=finance&q=<what they searched>
 *   /dashboard/ideas/<uuid of one of their ideas>
 *   https://someone-elses-site.example/...   (from a compromised client)
 *
 * So: same-origin absolute paths only, no query string, no fragment, no
 * protocol-relative "//evil.example" (which `startsWith("/")` alone
 * accepts and a browser treats as another origin), and no path segment
 * that looks like an id.
 *
 * Enforced SERVER-SIDE in api/nav-events/route.ts. The client calls it
 * too, but only to avoid a request it knows will be refused — the client
 * is not where this decision is made.
 */
export function isRecordableHref(href: unknown): href is string {
  if (typeof href !== "string") return false;
  if (href.length === 0 || href.length > MAX_HREF_LENGTH) return false;

  // Absolute same-origin path. "//host" is protocol-relative — a
  // different origin — and is the reason this is not `startsWith("/")`.
  if (!href.startsWith("/") || href.startsWith("//")) return false;

  // A query string or fragment is where the user's own words end up.
  if (href.includes("?") || href.includes("#")) return false;

  // Backslashes: some browsers normalise "/\evil.example" to a
  // protocol-relative URL, so it never reaches the table.
  if (href.includes("\\")) return false;

  const segments = href.split("/").filter(Boolean);

  // A UUID or a long opaque token as a segment means this is a link to
  // ONE RECORD, not to a page. Those are not what this table is for and
  // they are the most sensitive thing that could land in it.
  for (const segment of segments) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return false;
    if (segment.length > 32) return false;
  }

  // Whitespace and control characters have no place in a path and are
  // how a log line gets forged if one is ever printed.
  // Escape sequences, not literal control bytes: writing the raw
  // characters into the source makes this file binary to grep and
  // invisible in review, which is the opposite of what a security
  // check needs to be.
  if (/[\s\u0000-\u001f\u007f]/.test(href)) return false;

  return true;
}
