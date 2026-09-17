#!/usr/bin/env node
/*
 * CAN page-auth-boundary.test.mjs SEE THE DASHBOARD GO PUBLIC?
 *
 * Before this gate existed, every mutant below left a green build across
 * 262 other gates. The boundary for seven dashboard pages is one line in
 * one layout, and the second layer is one regex in one matcher; nothing
 * read either.
 *
 *   1. the layout reads the user and renders anyway — the likelier of the
 *      two edits, because the page still works while signed in.
 *   2. the layout stops reading the user at all.
 *   3. the middleware matcher starts excluding /dashboard, so the second,
 *      independent layer goes quietly.
 *   4. the matcher stops excluding `s/`, which puts a Supabase getUser
 *      round trip on every anonymous view of every customer's site.
 *   5. the onboarding page — the one page outside /dashboard that is
 *      neither public nor under a guarding layout — loses its redirect.
 *   6. the middleware reads the user and lets the request through. The
 *      first version of this gate asserted only that it RESOLVES, so this
 *      edit left it green while the layer its own header calls
 *      "independent of the first" was gone.
 *   7. a page's only resolution is a string in a log line. Two pages
 *      passed on exactly that for a day, because the detector read a
 *      diagLog template as a call.
 *
 * Run: node scripts/tests/page-auth-boundary.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/page-auth-boundary.test.mjs";
const LAYOUT = "src/app/dashboard/layout.tsx";
const MIDDLEWARE = "src/middleware.ts";
const ONBOARDING = "src/app/onboarding/page.tsx";
const TIMELINE = "src/app/dashboard/timeline/page.tsx";

const MUTANTS = [
  {
    name: "the dashboard layout reads the user and renders anyway",
    file: LAYOUT,
    from: '  if (!user) {\n    redirect("/login");\n  }',
    to: "",
    expect: "refuses when there is none",
  },
  {
    name: "the dashboard layout stops reading who is asking",
    file: LAYOUT,
    from: "  const user = await getCurrentUser();",
    to: "  const user = { id: \"\", email: \"\" } as Awaited<ReturnType<typeof getCurrentUser>>;",
    expect: "it resolves the user",
  },
  {
    name: "the middleware matcher starts excluding the dashboard",
    file: MIDDLEWARE,
    from: '"/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|s/|',
    to: '"/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|s/|dashboard|',
    expect: "does not exclude the dashboard",
  },
  {
    name: "the matcher stops excluding published customer sites",
    file: MIDDLEWARE,
    from: "|manifest.webmanifest|s/|",
    to: "|manifest.webmanifest|",
    expect: "excludes the published-site path",
  },
  {
    name: "the onboarding page loses its redirect",
    file: ONBOARDING,
    from: '  if (!user) {\n    redirect("/login");\n  }',
    to: "",
    expect: "every page is behind an auth boundary",
  },
  {
    name: "the middleware reads the user and lets the request through",
    file: MIDDLEWARE,
    from: "  if (!user && isDashboardRoute) {",
    to: "  if (false && !user && isDashboardRoute) {",
    expect: "refuses a dashboard request with no user",
  },
  {
    name: "a page's only resolution is the string in its log line",
    file: TIMELINE,
    from: "  const { user, error: userError } = await getCurrentUserResult();",
    to: "  const { user, error: userError } = { user: null, error: null } as Awaited<ReturnType<typeof getCurrentUserResult>>;",
    expect: "every page is behind an auth boundary",
  },
];

runMutations({
  name: "page-auth-boundary",
  gate: GATE,
  targets: [LAYOUT, MIDDLEWARE, ONBOARDING, TIMELINE],
  mutants: MUTANTS,
});
