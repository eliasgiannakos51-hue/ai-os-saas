/**
 * WHICH SLICE OF THE MESSAGE CATALOGUE A PUBLIC PAGE NEEDS.
 *
 * The root layout hands `messages` to NextIntlClientProvider, and that
 * object is serialised into the HTML of every page. All 2,659 keys of
 * it. Measured on the live home page: 209,715 characters, of which the
 * catalogue starts at 57,710 — 72% of the document is text the page does
 * not use. In Greek, the largest catalogue, the same page is 303,706
 * characters against English's 210,565: a Greek visitor downloads 93 KB
 * more than an English one before reading a word, and Greek is the
 * primary market.
 *
 * Trimming to what public pages actually use leaves 7% of it.
 *
 * ONLY THE CLIENT PAYLOAD. Server components call getTranslations(),
 * which reads the request's own messages and never touches this provider
 * — so a namespace missing here cannot break a server-rendered string. It
 * can only break a CLIENT component, at runtime, on a public page, in
 * front of a stranger. That is the whole risk, and it is why the list is
 * derived by a gate rather than trusted.
 *
 * FAIL-SAFE BY DEFAULT. A route is trimmed only if it is NOT under one of
 * APP_ROUTE_PREFIXES. Get the classification wrong in one direction and
 * an authenticated page ships 148 KB it did not need; wrong in the other
 * and a public page loses a string. So the prefixes list the AUTHENTICATED
 * areas and everything else is public — and the gate proves every page
 * under a prefix really does refuse an anonymous visitor.
 */

/**
 * The namespaces every client component reachable from a public route
 * asks for. Derived, not guessed: scripts/tests/marketing-messages.test.mjs
 * walks the import graph from all 15 public entry points, finds the 18
 * client components among the 79 files, and fails if any of them names a
 * namespace that is not here — or if one here is used by none of them.
 */
export const MARKETING_NAMESPACES = [
  "auth",
  "common",
  "cookies",
  "language",
  "pricing",
] as const;

/**
 * Route prefixes that require a session. Pages under these get the whole
 * catalogue, because their components use most of it and because a
 * missing string behind a login is still a bug.
 */
export const APP_ROUTE_PREFIXES = ["/dashboard", "/onboarding"] as const;

export function isMarketingPath(pathname: string): boolean {
  if (!pathname.startsWith("/")) return false;
  return !APP_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * The named top-level namespaces, in the order given, skipping any the
 * catalogue does not have.
 *
 * SKIPPING RATHER THAN THROWING is deliberate: this runs in the root
 * layout of every request, and a typo in the list must degrade to "that
 * component falls back to its key" rather than to a blank site. The gate
 * is what turns the typo red, at build time, where it belongs.
 */
export function pickNamespaces(
  messages: Record<string, unknown>,
  names: readonly string[] = MARKETING_NAMESPACES,
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const name of names) {
    if (name in messages) picked[name] = messages[name];
  }
  return picked;
}
