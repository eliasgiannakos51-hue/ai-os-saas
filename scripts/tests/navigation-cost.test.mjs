// What a dashboard page costs before it can render — as a ratchet.
//
// THE REPORT: "οι μεταβάσεις μεταξύ σελίδων είναι αργές". The measurement
// that found the cause is scripts/tests/navigation-latency.prodtest.mjs —
// a real build, a real browser, a mock database with a 25ms round trip.
// What it found, per dashboard route, BEFORE:
//
//   route             TTFB    queries   longest serial chain
//   overview          313ms      103            11
//   chat              213ms       53             7
//   files             196ms       53             6
//   settings          255ms       79             9
//
// Fifty-three queries to render a page that shows a list of files. Forty-two
// of them were the achievement reconciliation, which dashboard/layout.tsx
// awaited on EVERY navigation and which produced a visible result on almost
// none of them. The rest was a queue: pages awaited their independent reads
// one statement at a time, so a page with six reads cost six round trips
// instead of one.
//
// That prodtest needs a port, a browser and four minutes. This file is the
// part that can run in the build gate: it reads the source and fails if the
// cost creeps back. It cannot measure milliseconds — it measures the two
// things that produced them.
//
// Run: node scripts/tests/navigation-cost.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const layout = readFileSync("src/app/dashboard/layout.tsx", "utf8");

console.log("== 1. the shared layout is not where slow work goes ==");
// A layout wraps EVERY route under it, so a query added here is a query
// added to every page in the product at once. That is what made this the
// most expensive place in the app to be careless.
check(
  "the achievement battery is not awaited in the layout",
  !/checkAndUnlockAchievements/.test(layout),
  "≈42 reads across 14 tables, on every navigation, for a toast that almost never fires"
);
check(
  "…it moved to an endpoint the client calls after paint",
  /export async function POST/.test(readFileSync("src/app/api/achievements/check/route.ts", "utf8"))
);
const bridge = readFileSync("src/components/achievements/achievement-unlock-bridge.tsx", "utf8");
check("…which the bridge calls", /fetch\("\/api\/achievements\/check", \{ method: "POST" \}\)/.test(bridge));
check("…behind requestIdleCallback, so it never competes with hydration", /requestIdleCallback/.test(bridge));
check("…and not on every page load", /RECHECK_AFTER_MS/.test(bridge) && /sessionStorage/.test(bridge));

check(
  "the layout reads user_credits once, not twice",
  !/getPurchasedPackCreditPriceEur/.test(layout) && /packCreditPriceEurFromRow/.test(layout),
  "the balance and the pack price live on the same row"
);
// The layout's own awaits, counted. getUser and the plan are genuinely
// sequential (the plan needs the user, the credits need the plan); anything
// beyond that is a queue.
const layoutBody = layout.slice(layout.indexOf("export default async function"));
const layoutAwaits = (layoutBody.match(/^ {2}(?:const|let)[^\n]*= await |^ {2}await /gm) ?? []).length;
check(`the layout awaits ${layoutAwaits} things in sequence (≤ 3)`, layoutAwaits <= 3, layoutBody.match(/^ {2}(?:const|let)[^\n]*= await /gm)?.join("\n        "));

console.log("\n== 2. no page rebuilds the queue ==");
// Translations are not database round trips — getTranslations/getLocale
// resolve from a message bundle already in memory — so they do not count
// against a page's budget. Everything else at the top level of the page
// component is a thing the user waits for, one after another.
const FREE = /await (getTranslations|getLocale|headers|cookies|params|searchParams)\b/;
/** Every page.tsx under src/app/dashboard, at any depth. */
function pagesUnder(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...pagesUnder(full));
    else if (entry.name === "page.tsx") found.push(full);
  }
  return found;
}
const pages = pagesUnder("src/app/dashboard");
check(`there are dashboard pages to check (${pages.length})`, pages.length >= 25);

/** The ceiling. Three is: the auth read, one thing that depends on it, and
 *  one wave of everything else. A page needing a fourth is a page that
 *  should be putting something in the wave. */
const SERIAL_AWAIT_CEILING = 4;
const overBudget = [];
for (const file of pages) {
  const source = readFileSync(file, "utf8");
  const start = source.indexOf("export default async function");
  if (start < 0) continue;
  const body = source.slice(start);
  // ONE AWAIT, COUNTED ONCE. This used to match single-line awaits and
  // destructured awaits with two separate patterns and ADD the two
  // counts — so `const { user, error } = await getCurrentUserResult();`,
  // which is both, was counted twice and Timeline was reported as waiting
  // on five things when it waits on three.
  //
  // Worse in the other direction: the multi-line form
  //
  //     const {
  //       data: { user },
  //     } = await supabase.auth.getUser();
  //
  // never matched the single-line pattern at all, and thirty of these
  // thirty-eight pages were written that way. The double-count and the
  // blind spot happened to cancel out often enough that nothing looked
  // wrong. Multi-line blocks are consumed FIRST and blanked, then the
  // single-line pattern runs on what is left, so neither can happen.
  let remaining = body;
  const destructured = [];
  for (const m of body.matchAll(/^ {2}(?:const|let) \{[\s\S]*?\} = await [^\n]*$/gm)) {
    if (!FREE.test(m[0])) destructured.push(m[0]);
    remaining = remaining.replace(m[0], m[0].replace(/[^\n]/g, " "));
  }
  const serial = (remaining.match(/^ {2}(?:const|let)[^\n]*=\s*await [^\n]*$|^ {2}await [^\n]*$/gm) ?? []).filter(
    (line) => !FREE.test(line)
  );
  const total = serial.length + destructured.length;
  if (total > SERIAL_AWAIT_CEILING) {
    overBudget.push(`${file.replace("src/app/dashboard/", "")}: ${total}\n          ` + [...destructured, ...serial].map((l) => l.trim().split("\n")[0]).join("\n          "));
  }
}
check(
  `every dashboard page waits on ≤ ${SERIAL_AWAIT_CEILING} things in sequence (${pages.length - overBudget.length}/${pages.length})`,
  overBudget.length === 0,
  overBudget.join("\n        ")
);

console.log("\n== 3. the two pages the measurement singled out ==");
const overview = readFileSync("src/app/dashboard/overview/page.tsx", "utf8");
check(
  "Home fans its fourteen modules out in one wave, not two per module",
  /Promise\.allSettled\(\[/.test(overview),
  "the two per-module reads are independent and were awaited in sequence"
);
check("…and its independent reads share one Promise.all", /ONE WAVE, NOT A QUEUE/.test(overview));
check(
  "…while the onboarding check stays first, so a redirected account does no work",
  overview.indexOf("user_onboarding") < overview.indexOf("ONE WAVE, NOT A QUEUE")
);
const settings = readFileSync("src/app/dashboard/settings/page.tsx", "utf8");
check("Settings reads its eleven independent things together", /ONE WAVE\./.test(settings));
check(
  "…and still defers the bypass ledger, which depends on the beta window",
  settings.indexOf("const isBeta =") < settings.indexOf('.from("ai_cost_log")\n      .select("metadata")')
);

console.log("\n== 4. the transition itself ==");
const css = readFileSync("src/app/globals.css", "utf8");
const duration = Number(css.match(/animation: page-enter (\d+)ms/)?.[1] ?? 0);
check(
  `the route entrance animation is ${duration}ms (≤ 200ms)`,
  duration > 0 && duration <= 200,
  "the wrapper starts at opacity 0, so this is added to every click→content time"
);
const rise = Number(css.match(/@keyframes page-enter \{[\s\S]*?translateY\((\d+)px\)/)?.[1] ?? 0);
check(`…rising ${rise}px, not a long slide (≤ 12px)`, rise > 0 && rise <= 12);

console.log("\n== 5. what a route shows while it is arriving ==");
const loading = readFileSync("src/app/dashboard/loading.tsx", "utf8");
check("the dashboard's Suspense fallback is a page-shaped skeleton", /RouteSkeleton/.test(loading));
const skeleton = readFileSync("src/components/dashboard/route-skeleton.tsx", "utf8");
check("…with the same width and padding as a real page", /max-w-5xl/.test(skeleton) && /px-4 py-8/.test(skeleton));
check("…announced to a screen reader", /role="status"/.test(skeleton) && /aria-label/.test(skeleton));
check(
  "…and it claims nothing: no counts, no titles, no numbers",
  !/\{[a-zA-Z]+Count\}|\{t\("(?!.*loadingContent)/.test(skeleton)
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
