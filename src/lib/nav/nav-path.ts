import { MODULES } from "@/lib/modules";

/**
 * WHAT A NAVIGATION IS ALLOWED TO SAY ABOUT ITSELF.
 *
 * nav_events answers "which screens are opened, how often, and what does
 * one person actually use" — see the migration
 * 20260915000000_nav_events.sql for why the table exists at all. This file
 * is the half that decides what may be written into it, and it runs
 * SERVER-SIDE, in app/api/nav/track/route.ts, on a value that arrived from
 * a browser. A client that posts anything else gets its value replaced or
 * dropped, not stored.
 *
 * THREE THINGS ARE REMOVED, and each is removed for its own reason:
 *
 *   THE QUERY STRING. `/dashboard/finance?record=<uuid>` is the deep link
 *   the whole of scripts/tests/deep-links.test.mjs exists to protect, and
 *   `record` is the id of a row this person wrote. A navigation log that
 *   kept it would be a second index of their content, held under looser
 *   rules than the content itself.
 *
 *   IDENTIFIERS IN THE PATH. `/dashboard/documents/<uuid>` collapses to
 *   `/dashboard/documents/:id`. Same reason, plus a second one that is
 *   purely practical: `path` is the GROUP BY of both analysis views. Left
 *   unbounded it would turn a thirty-nine-row answer into one row per
 *   document in the product, which is not an answer.
 *
 *   ANYTHING THAT IS NOT A ROUTE. A URL under /dashboard that matches no
 *   page in this app becomes the single constant '/dashboard/:unknown'.
 *   That keeps dead links visible as one countable bucket instead of
 *   letting arbitrary text reach the column.
 *
 * AND ONE THING IS NOT: the route list below is not a copy of the app's
 * routes, it is a claim about them. scripts/tests/nav-events.test.mjs
 * reads src/app/dashboard/ and fails if this list has drifted in either
 * direction — a screen added and never tracked, or a screen deleted and
 * still listed. The module half is not even a list: it is read straight
 * out of MODULES, so a thirteenth module is tracked the day it exists.
 */

/** Every URL under /dashboard that matches no page in the app. */
export const NAV_UNKNOWN_PATH = "/dashboard/:unknown";

/** Days of history kept. The migration's prune_nav_events() default. */
export const NAV_RETENTION_DAYS = 90;

/**
 * Literal first segments under /dashboard with a page.tsx of their own.
 *
 * NOT INCLUDING the twelve records modules: those share the single
 * /dashboard/[module] route and come from MODULES below, so that adding a
 * module needs no edit here. `/dashboard` itself is the Ideas list —
 * lib/classifier-modules.ts's moduleHref maps the "ideas" slug to the
 * bare path — which is why the root is a tracked screen and not a
 * redirect.
 */
export const NAV_STATIC_SEGMENTS: readonly string[] = [
  "affiliate",
  "agents",
  "apps",
  "business-health",
  "campaigns",
  "chat",
  "coding",
  "costs",
  "create",
  "data-analysis",
  "deep-research",
  "documents",
  "favorites",
  "files",
  "form-submissions",
  "images",
  "integrations",
  "marketplace",
  "memory",
  "mission",
  "overview",
  "presentations",
  "product-workflow",
  "published",
  "records",
  "reflection",
  "routing",
  "settings",
  "system-health",
  "team",
  "timeline",
  "trading-journal",
  "trading-workflow",
  "videos",
  "website-builder",
  "websites",
];

/**
 * First segments whose CHILD is a dynamic parameter, i.e. every route in
 * the app that is three segments deep. There is exactly one today
 * (/dashboard/documents/[id]); the gate fails if a second appears and is
 * not named here, rather than silently filing it under :unknown.
 */
export const NAV_NESTED_DYNAMIC: readonly string[] = ["documents"];

/** The twelve records modules, read from the config the app itself uses. */
export function navModuleSegments(): string[] {
  return MODULES.map((m) => m.slug);
}

/**
 * A pathname as it may be stored, or null for "do not store this".
 *
 * Null — not a throw and not a placeholder row — for anything outside
 * /dashboard. Marketing pages, /login and /pricing are not what this
 * instrument is for, and a row saying "somebody went somewhere else"
 * would dilute every percentage the views compute.
 */
export function normaliseNavPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // A cap before any parsing: the longest legal input is a route plus a
  // query string, and anything past 2KB is not a navigation.
  if (raw.length === 0 || raw.length > 2048) return null;

  const bare = raw.split("?")[0].split("#")[0];
  const segments = bare.split("/").filter(Boolean);
  if (segments[0] !== "dashboard") return null;
  if (segments.length === 1) return "/dashboard";

  const first = segments[1];
  const known =
    NAV_STATIC_SEGMENTS.includes(first) || navModuleSegments().includes(first);
  if (!known) return NAV_UNKNOWN_PATH;
  if (segments.length === 2) return `/dashboard/${first}`;
  if (segments.length === 3 && NAV_NESTED_DYNAMIC.includes(first)) {
    return `/dashboard/${first}/:id`;
  }
  return NAV_UNKNOWN_PATH;
}

/**
 * The screen BEFORE this one — the column that makes a flow readable
 * rather than a pile of counts.
 *
 * NOT document.referrer, which for a client-side navigation is whatever
 * page first loaded the tab and for an external arrival is somebody
 * else's URL. The client sends either the in-app pathname it came from,
 * or the literal 'external'. Anything else becomes null: an unrecognised
 * referrer is a missing answer, and a missing answer is a null, never a
 * guess written into a column that reads as measured.
 */
export function normaliseNavReferrer(raw: unknown): string | null {
  if (raw === "external") return "external";
  return normaliseNavPath(raw);
}
