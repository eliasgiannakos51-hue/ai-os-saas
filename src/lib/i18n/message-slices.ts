/**
 * WHICH SLICE OF THE MESSAGE CATALOGUE EACH AREA OF THE APP NEEDS.
 *
 * ANALYSIS, NOT A SWITCH. Nothing reads this to trim anything today, and
 * the reason is written in app/layout.tsx: trimming shipped for one
 * deploy and broke every dashboard page, because the ROOT layout is
 * shared. In the App Router it renders once and is reused across
 * client-side navigations beneath it — so the slice chosen for /login was
 * still in force after signing in, and the sidebar rendered
 * `sidebar.items.home` at 188 client components' worth of scale.
 *
 * WHAT THE MEASUREMENT STILL SAYS. On the live home page the catalogue is
 * 72% of the document; in Greek, the primary market, the same page is
 * 303,706 characters against English's 210,565. Public pages use five
 * namespaces of the forty. That saving is real and still unclaimed.
 *
 * WHAT WOULD MAKE IT CLAIMABLE, in order:
 *
 *   1. A layout per route group, each with its own
 *      NextIntlClientProvider, so the slice is chosen where the group is
 *      — not in a component that never re-runs when the path changes.
 *   2. The group being trimmed must contain NO component that can reach
 *      an unbounded key: useTranslations() with no namespace,
 *      useMessages(), or t() with a computed key. The dashboard has
 *      twenty such components; `canTrim` below is that rule, and it is
 *      why only the marketing group is eligible.
 *
 * Until both hold, app/layout.tsx sends everything to everyone and the
 * gate asserts that it does.
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

/**
 * Every area of the app, and what its client components ask for.
 *
 * EVERY GROUP, NOT ONLY THE PUBLIC ONE. The first version of this file
 * described the marketing routes and nothing else, and that omission is
 * exactly what shipped a broken dashboard: a list of what one area needs
 * says nothing about what the others lose. Each entry is derived by
 * scripts/tests/message-slices.test.mjs from the real import graph and
 * fails the build when it drifts.
 *
 * `namespaces` is what the group's client components name. `unbounded` is
 * how many of them ask in a way no list can bound — and one is enough to
 * disqualify the whole group from ever being trimmed.
 */
export type RouteGroup = {
  name: string;
  /** Path prefixes, or [] for "everything not claimed by another group". */
  prefixes: readonly string[];
  namespaces: readonly string[];
  /** Client components reachable from this group that can reach any key. */
  unbounded: number;
};

export const ROUTE_GROUPS: readonly RouteGroup[] = [
  {
    name: "dashboard",
    prefixes: ["/dashboard"],
    // MEASURED, AND MY FIRST WRITING OF THIS LIST WAS WRONG TWICE: it
    // included "auth", which no dashboard client component asks for, and
    // omitted "language", which the language selector in the top bar
    // does. The gate caught both, which is the only reason they are right
    // here.
    namespaces: [
      "achievements", "aiSteps", "askAi", "coding", "common", "credits",
      "dashboard", "dataAnalysis", "entityLinks", "errors", "favorites",
      "finance", "language", "module", "promise", "publishing", "pwa",
      "security", "settings", "sidebar", "voice",
    ],
    // SIXTY-TWO, and it was twenty when I first wrote this number down.
    // Twenty call useTranslations() with no namespace; the rest reach a
    // key through a template literal or a variable, which is just as
    // unpredictable. Counting only the first shape is how a number
    // becomes comfortable.
    //
    // The sixty-second is overview/first-screen-examples.tsx, which
    // renders `t(\`${id}.verb\`)` for each of the three capabilities.
    // The gate found it, which is the point of counting rather than
    // asserting.
    unbounded: 62,
  },
  {
    name: "onboarding",
    prefixes: ["/onboarding"],
    // "promise" is here because the one sentence (lib/i18n/one-sentence.ts)
    // opens the first onboarding step as well as the first screen after
    // signing in. It is one key, and it is still declared: a namespace
    // that reaches a group without appearing here is exactly the drift
    // that shipped a dashboard of raw keys.
    namespaces: ["common", "dashboard", "promise"],
    unbounded: 3,
  },
  {
    name: "marketing",
    prefixes: [],
    namespaces: ["auth", "common", "cookies", "language", "pricing"],
    unbounded: 0,
  },
];

/** The group a path belongs to. The prefix-less group is the default. */
export function groupForPath(pathname: string): RouteGroup {
  if (!pathname.startsWith("/")) {
    // NOT A PATH, NOT A GUESS. Anything unrecognisable falls to the group
    // that gets the whole catalogue, which is the only safe direction.
    return ROUTE_GROUPS.find((g) => g.unbounded > 0) ?? ROUTE_GROUPS[0];
  }
  const claimed = ROUTE_GROUPS.find((g) =>
    g.prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`)),
  );
  return claimed ?? ROUTE_GROUPS.find((g) => g.prefixes.length === 0)!;
}

/**
 * Whether a group may be sent less than everything.
 *
 * ONE UNBOUNDED COMPONENT DISQUALIFIES THE GROUP. useTranslations() with
 * no namespace can ask for any key in the catalogue at runtime, and no
 * static list can promise the slice is enough. The dashboard has twenty.
 */
export function canTrim(group: RouteGroup): boolean {
  return group.unbounded === 0 && group.namespaces.length > 0;
}

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
