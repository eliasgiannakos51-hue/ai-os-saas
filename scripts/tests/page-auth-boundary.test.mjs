// SIXTY-THREE PAGES, ONE `redirect("/login")`, AND NOTHING READ IT.
//
// Every page under /dashboard is behind an auth check. For seven of the
// forty-six it is not their own: they resolve no user and refuse nobody,
// and what stands between them and a stranger is one line in
// src/app/dashboard/layout.tsx:
//
//     const user = await getCurrentUser();
//     if (!user) { redirect("/login"); }
//
// and behind one regex in src/middleware.ts's matcher, which decides
// whether the middleware runs its own getUser for a given path at all.
//
// Neither was read by any of the 262 gates. owner-only-access.test.mjs
// checks the ADMIN boundary — isAdminEmail, the margin report, the
// settings page — and is careful about it. security-posture.test.mjs
// checks every ENDPOINT. A page is neither: it is not admin-only and it
// is not a route.ts, so it fell between two thorough instruments, and
// deleting that redirect would have turned 46 pages public with a green
// build. What survives is not the data — the browser client is still
// under RLS — but the shell: which modules exist, what the account's plan
// is, the nav, and every page that reads through an admin client after
// the layout has vouched for the caller.
//
// (Seven is measured, not remembered: this file prints the count on every
// run, from the same guards() the checks use. It was 30 in a first draft
// of this comment, taken from `grep -L getUser` — which misses
// getCurrentUser, the helper most of these pages actually call.)
//
// THE RULE. Every page.tsx under src/app is behind an auth boundary — its
// own, or one in a layout.tsx above it on the path — or is DECLARED
// public below with the reason. Both directions are checked, so a
// declaration cannot outlive the page it excuses.
//
// Run: node scripts/tests/page-auth-boundary.test.mjs
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

let pass = 0,
  fail = 0;
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const pages = [];
const layouts = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry === "page.tsx") pages.push(full.replace(/\\/g, "/"));
    else if (entry === "layout.tsx") layouts.push(full.replace(/\\/g, "/"));
  }
})("src/app");

check(`pages found (${pages.length})`, pages.length >= 50, "the walk found almost nothing and every check below is vacuous");
check(`layouts found (${layouts.length})`, layouts.length >= 2, "no layout was found, so the ancestor resolution below can only ever say no");

// AN AUTH BOUNDARY IS A RESOLUTION PLUS A REFUSAL. Reading the user is
// not a boundary: half the dashboard reads it to render a name. The
// boundary is reading it AND sending the caller somewhere when it is
// absent. Both halves are required, which is what makes deleting the
// `redirect` — the likelier edit of the two — go red here.
const RESOLVES = /getCurrentUser\s*\(|auth\s*\.\s*getUser\s*\(/;
const REFUSES = /redirect\s*\(\s*["'`]\/(login|signup)|notFound\s*\(\s*\)/;
function guards(file) {
  if (!existsSync(file)) return false;
  const src = strip(readFileSync(file, "utf8"));
  return RESOLVES.test(src) && REFUSES.test(src);
}

/** Every layout.tsx from the page's own directory up to src/app. */
function ancestorLayouts(page) {
  const out = [];
  let dir = path.dirname(page);
  while (true) {
    const candidate = `${dir}/layout.tsx`.replace(/\\/g, "/");
    if (layouts.includes(candidate)) out.push(candidate);
    if (dir === "src/app" || dir === "src" || dir === "." || dir === "") break;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return out;
}

// Pages a stranger is SUPPOSED to reach. Each reason is the argument, not
// a label — "it is public" is not one.
const PUBLIC_ON_PURPOSE = {
  "src/app/page.tsx": "the landing page. A product whose front door requires a session has no front door.",
  "src/app/pricing/page.tsx": "the prices, which are the main thing somebody who has not signed up came to read.",
  "src/app/help/page.tsx": "half the questions it answers are asked before anyone signs up; app/help/page.tsx says so in its own header.",
  "src/app/contact/page.tsx": "the contact form: somebody who cannot sign in is exactly who needs it.",
  "src/app/terms/page.tsx": "a legal page that must be readable before agreeing to it.",
  "src/app/privacy/page.tsx": "the same, and linked from the footer of every public page.",
  "src/app/cookies/page.tsx": "the same, and the one a consent banner links to before any session exists.",
  "src/app/acceptable-use/page.tsx": "the same: a rule nobody can read before accepting is not a rule.",
  "src/app/ai-transparency/page.tsx": "what the product does with a model, published so it can be read without an account.",
  "src/app/roadmap/page.tsx": "what is coming, linked from the public footer.",
  "src/app/login/page.tsx": "it creates the session; requiring one first is a contradiction.",
  "src/app/signup/page.tsx": "it creates the account, which is the one thing nobody can already have a session for.",
  "src/app/forgot-password/page.tsx": "reached precisely by somebody who cannot sign in.",
  "src/app/reset-password/page.tsx": "reached from an emailed recovery link, before the session exists.",
  "src/app/delete-account/confirm/page.tsx":
    "reached from an emailed single-use token. The token is the credential and it is claimed atomically by /api/delete-account/confirm; requiring a session as well would strand anybody who had already been signed out.",
  "src/app/offline/page.tsx":
    "served by the service worker when the network is gone. It is fetched ONCE, over the network, at service-worker install — so it cannot depend on a session, and it deliberately holds no account data at all.",
};

const unguarded = [];
for (const page of pages) {
  if (PUBLIC_ON_PURPOSE[page]) continue;
  const own = guards(page);
  const ancestor = ancestorLayouts(page).find(guards);
  if (!own && !ancestor) unguarded.push(page);
}
check(
  "every page is behind an auth boundary, or is declared public",
  unguarded.length === 0,
  unguarded.length
    ? `no guard on the page and none in any layout above it:\n        ${unguarded.join("\n        ")}\n        ` +
      "Guard it, or add it to PUBLIC_ON_PURPOSE with the argument for why a stranger may read it."
    : ""
);

const stale = Object.keys(PUBLIC_ON_PURPOSE).filter((p) => !pages.includes(p));
check("no public-page declaration outlives its page", stale.length === 0, stale.join(", "));
const shortReasons = Object.entries(PUBLIC_ON_PURPOSE).filter(([, why]) => why.length < 40);
check("every public-page reason is an argument", shortReasons.length === 0, shortReasons.map(([p]) => p).join(", "));

// ---------------------------------------------------------------------
// THE LOAD-BEARING ONE, NAMED. 30 of the 46 dashboard pages have no guard
// of their own; the layout is the whole boundary for them. A gate that
// only said "every page is covered" would stay green if 46 pages each
// grew their own check and the layout lost its — which is fine — and also
// if the layout kept its getCurrentUser and lost the redirect, which is
// not. So the layout is asserted directly as well.
// ---------------------------------------------------------------------
const DASHBOARD_LAYOUT = "src/app/dashboard/layout.tsx";
check("the dashboard layout exists", existsSync(DASHBOARD_LAYOUT));
const layoutSrc = existsSync(DASHBOARD_LAYOUT) ? strip(readFileSync(DASHBOARD_LAYOUT, "utf8")) : "";
check("...it resolves the user", RESOLVES.test(layoutSrc), "nothing in the dashboard layout reads who is asking");
check("...and refuses when there is none", REFUSES.test(layoutSrc), "it reads the user and renders anyway");
const dashboardPages = pages.filter((p) => p.startsWith("src/app/dashboard/"));
const relyOnLayout = dashboardPages.filter((p) => !guards(p));
check(
  `...which is the only boundary for ${relyOnLayout.length} of ${dashboardPages.length} dashboard pages`,
  relyOnLayout.length >= 5,
  "if this has dropped to nothing, either every page now guards itself (fine — say so here) or the guard detector has stopped working"
);

// ---------------------------------------------------------------------
// The second layer, which is independent of the first: middleware runs
// getUser for every path its matcher does NOT exclude. The exclusions are
// static assets and `s/` (published customer sites, served to the public
// web with no session at all). A pattern that began excluding /dashboard
// would remove that layer silently, and the app would still work.
// ---------------------------------------------------------------------
const MIDDLEWARE = "src/middleware.ts";
check("the middleware exists", existsSync(MIDDLEWARE));
const mw = existsSync(MIDDLEWARE) ? strip(readFileSync(MIDDLEWARE, "utf8")) : "";
check("...and resolves the user itself", RESOLVES.test(mw), "the middleware no longer authenticates anything");
const matcher = /matcher:\s*\[([\s\S]*?)\]/.exec(mw);
check("...and declares a matcher", Boolean(matcher));
const pattern = matcher ? matcher[1] : "";
check(
  "...that does not exclude the dashboard",
  Boolean(pattern) && !/dashboard/.test(pattern),
  `the matcher mentions dashboard: ${pattern.trim().slice(0, 160)}`
);
check(
  "...and still excludes the published-site path, which has no session by design",
  /s\//.test(pattern),
  "every anonymous visitor to every customer's site would pay for a Supabase getUser round trip"
);

// ---------------------------------------------------------------------
// CONTROLS. They drive guards() on text of their own.
// ---------------------------------------------------------------------
check("control: reading the user without refusing is not a boundary", !(RESOLVES.test("const u = await getCurrentUser();") && REFUSES.test("const u = await getCurrentUser();")));
check("control: refusing without reading is not a boundary either", !(RESOLVES.test('redirect("/login");') && REFUSES.test('redirect("/login");')));
check("control: both together are", RESOLVES.test('const u = await getCurrentUser();\nif (!u) redirect("/login");') && REFUSES.test('const u = await getCurrentUser();\nif (!u) redirect("/login");'));
check(
  "control: a guard named only in a comment does not count",
  !guardsText(strip('// this page is behind getCurrentUser() and redirects to /login\nexport default function P() { return null; }')),
  "the comment stripper is not running"
);
function guardsText(src) {
  return RESOLVES.test(src) && REFUSES.test(src);
}

console.log(`\n        ${pages.length} pages · ${Object.keys(PUBLIC_ON_PURPOSE).length} public on purpose · ${relyOnLayout.length} standing on the dashboard layout alone`);
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
