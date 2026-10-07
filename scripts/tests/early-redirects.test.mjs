// A DASHBOARD REDIRECT IS DECIDED BEFORE THE PAGE STREAMS.
//
// Issue #61, React #310 on /dashboard/overview. Measured 2026-10-04 with
// scripts/tests/hook-order.repro.mjs (production build, 30 routes x 4
// widths per pass) and a log of every router action: each crash was on a
// page that redirected from its server component — Home to /onboarding,
// Team to /dashboard/settings. Every dashboard page renders under
// app/dashboard/loading.tsx, so such a redirect reaches the browser as a
// client-side `navigate` racing the router's prefetches, which is where
// React 18's #310 comes from. Moving Home's decision into proxy.ts
// took it from 3-5 crashes in 300 loads to 0, with Team, left alone as
// the control, still at 4.
//
// So: the decisions live in src/lib/nav/early-redirects.ts, proxy.ts
// makes them, and the pages repeat them through the same functions. And
// every OTHER redirect a dashboard page makes is listed below with the
// reason it cannot cause the crash, so a new one has to be argued for.
//
// Run: node scripts/tests/early-redirects.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { stripComments } from "../check-mutation-markers.mjs";
import { loadTsLinked } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const { onboardingRedirectTarget, teamRedirectTarget, PERMANENT_MOVES } = await loadTsLinked("src/lib/nav/early-redirects.ts");

console.log("== 1. the decisions ==");
check("not onboarded → /onboarding", onboardingRedirectTarget({ error: null, state: null }) === "/onboarding");
check("an empty row is not onboarded either", onboardingRedirectTarget({ error: null, state: { completed_at: null, skipped_at: null } }) === "/onboarding");
check("completed → stays", onboardingRedirectTarget({ error: null, state: { completed_at: "2026-10-01" } }) === null);
check("skipped → stays", onboardingRedirectTarget({ error: null, state: { skipped_at: "2026-10-01" } }) === null);
check("a FAILED read never sends anyone to onboarding", onboardingRedirectTarget({ error: { message: "400" }, state: null }) === null);
const owner = { subscription_tier: "pro", stripe_subscription_id: "sub_1" };
check("a free account is sent to Settings", teamRedirectTarget({ isAdmin: false, userMetadata: {}, setupParam: null }) === "/dashboard/settings");
check("an admin stays", teamRedirectTarget({ isAdmin: true, userMetadata: {}, setupParam: null }) === null);
check("the return from the team checkout stays, once", teamRedirectTarget({ isAdmin: false, userMetadata: {}, setupParam: "success" }) === null);
const plans = await loadTsLinked("src/lib/billing/plans.ts");
const withTeams = plans.PLANS.filter((p) => p.capabilities?.teamCollaboration).map((p) => p.slug);
const withoutTeams = plans.PLANS.filter((p) => !p.capabilities?.teamCollaboration).map((p) => p.slug);
// On a plan that HAS teams, so the only thing that can send them away is
// that the subscription is not theirs — on a plan without teams the tier
// alone would redirect, and the ownership rule would go untested.
check(
  `an invited member (a team tier, no subscription of their own) is sent to Settings`,
  withTeams.length > 0 && teamRedirectTarget({ isAdmin: false, userMetadata: { subscription_tier: withTeams[0] }, setupParam: null }) === "/dashboard/settings"
);
check(`a plan owner WITH team collaboration stays (${withTeams.join(", ")})`, withTeams.length > 0 && withTeams.every((slug) => teamRedirectTarget({ isAdmin: false, userMetadata: { ...owner, subscription_tier: slug }, setupParam: null }) === null));
check(`a plan owner WITHOUT it is sent to Settings (${withoutTeams.join(", ")})`, withoutTeams.length > 0 && withoutTeams.every((slug) => teamRedirectTarget({ isAdmin: false, userMetadata: { ...owner, subscription_tier: slug }, setupParam: null }) === "/dashboard/settings"));

console.log("\n== 2. middleware makes them, the pages repeat them ==");
const MW = stripComments(readFileSync("src/proxy.ts", "utf8"));
const authAt = MW.indexOf("if (user && isAuthRoute)");
const earlyAt = MW.indexOf("if (user && isDashboardRoute)");
check("middleware has the dashboard-redirect block, before the auth-route one", earlyAt > 0 && earlyAt < authAt);
const early = MW.slice(earlyAt, authAt);
check("…it answers the permanent moves with a 308", /PERMANENT_MOVES\[request\.nextUrl\.pathname\]/.test(early) && /NextResponse\.redirect\(url,\s*308\)/.test(early));
check(
  "…it reads onboarding for Home and decides with onboardingRedirectTarget",
  /pathname === "\/dashboard\/overview"/.test(early) &&
    /\.from\("user_onboarding"\)\s*\.select\("completed_at, skipped_at"\)/.test(early) &&
    /onboardingRedirectTarget\(\{\s*error,\s*state:\s*data\s*\}\)/.test(early)
);
check(
  "…it decides Team with teamRedirectTarget",
  /pathname === "\/dashboard\/team"/.test(early) && /teamRedirectTarget\(\{/.test(early) && /isAdminEmail\(user\.email\)/.test(early)
);
check("…and keeps the refreshed cookies on every redirect", (early.match(/withRefreshedCookies\(NextResponse\.redirect\(/g) ?? []).length === 3);
const OVERVIEW = stripComments(readFileSync("src/app/dashboard/overview/page.tsx", "utf8"));
check("Home's own fallback uses the same function", /onboardingRedirectTarget\(\{\s*error:\s*onboardingError,\s*state:\s*onboardingState\s*\}\)/.test(OVERVIEW) && /redirect\(onboardingTarget\)/.test(OVERVIEW));
const TEAM = stripComments(readFileSync("src/app/dashboard/team/page.tsx", "utf8"));
check("Team's own fallback uses the same function", /if \(teamRedirectTarget\(\{/.test(TEAM));
const MEMORY = stripComments(readFileSync("src/app/dashboard/memory/page.tsx", "utf8"));
check("the old Memory address reads its target from PERMANENT_MOVES", /permanentRedirect\(PERMANENT_MOVES\["\/dashboard\/memory"\]\)/.test(MEMORY) && PERMANENT_MOVES["/dashboard/memory"] === "/dashboard/search");

console.log("\n== 3. every other redirect a dashboard page makes ==");
// The population is the directory, not a list of the three above. A
// redirect to /login is unreachable from a page — middleware sends a
// signed-out request to /login before any page renders — so it is not
// counted. Everything else is either handled above or listed here.
const HANDLED = {
  "src/app/dashboard/overview/page.tsx": "middleware: onboardingRedirectTarget",
  "src/app/dashboard/team/page.tsx": "middleware: teamRedirectTarget",
  "src/app/dashboard/memory/page.tsx": "middleware: PERMANENT_MOVES",
};
const UNREACHABLE = {
  // getModule("products") is the static module table; it cannot be absent
  // for a real request, so this redirect never fires.
  "src/app/dashboard/product-workflow/page.tsx": "only when the products module is missing from the static table",
  "src/app/dashboard/trading-workflow/page.tsx": "only when the trading module is missing from the static table",
  // Only for the old ?view=fav link. Not in the crash log of 2026-10-04,
  // and no screen links to it any more.
  "src/app/dashboard/timeline/page.tsx": "only for the retired ?view=fav address",
};
function pages(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...pages(full));
    else if (name === "page.tsx" || name === "layout.tsx") out.push(full);
  }
  return out;
}
const found = [];
for (const file of pages("src/app/dashboard")) {
  const code = stripComments(readFileSync(file, "utf8"));
  const calls = [...code.matchAll(/\b(?:permanentRedirect|redirect)\(([^)]*)\)/g)].map((m) => m[1].trim());
  if (calls.some((arg) => arg !== '"/login"')) found.push(file);
}
const unexplained = found.filter((f) => !(f in HANDLED) && !(f in UNREACHABLE));
check(`dashboard pages that redirect (${found.length}) were found`, found.length >= 6, found.join(", "));
check("every one is handled in middleware or listed with a reason", unexplained.length === 0, unexplained.join(", "));
const stale = [...Object.keys(HANDLED), ...Object.keys(UNREACHABLE)].filter((f) => !found.includes(f));
check("no listed page has stopped redirecting (the list is checked both ways)", stale.length === 0, stale.join(", "));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
