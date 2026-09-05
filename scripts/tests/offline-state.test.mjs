// A CACHED PAGE THAT LOOKS LIVE.
//
// The service worker already served the last version of any page from
// cache when a navigation failed. That is the right behaviour, and it is
// the dangerous one: the user gets a dashboard that looks completely
// normal and simply is not true any more. A number that stopped updating
// is indistinguishable from a number that did not change, and nothing on
// any page said which it was.
//
// What this file pins:
//
//   · `navigator.onLine` is believed when FALSE and never when TRUE. It
//     reports `true` behind a captive portal, on a dropped VPN, and on a
//     phone with one bar and no throughput — so recovery is declared
//     only when something actually reaches the server.
//   · A 500 is not offline. It resolves; only a transport failure
//     rejects. Calling a server error "check your connection" tells the
//     user to fix something that is fine and buries a real bug.
//   · The banner says three things in order: what happened, how old what
//     they are reading is, and one button that checks rather than
//     guesses.
//
// Run: node scripts/tests/offline-state.test.mjs
import { createTranslator } from "next-intl";
import { carriesNumber } from "./icu-carries.mjs";
import { readFileSync } from "node:fs";

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
function checkList(name, actual) {
  check(name, actual.length === 0, actual.slice(0, 8).join("\n        "));
}

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [
    l,
    JSON.parse(readFileSync(`messages/${l}.json`, "utf8")),
  ]),
);

const { loadTs } = await import("./load-ts.mjs");
const { isNetworkError, stalenessMinutes } = await loadTs(
  "src/lib/network/offline.ts",
);

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const statusSrc = readFileSync("src/lib/network/network-status.ts", "utf8");
const status = stripComments(statusSrc);
const banner = stripComments(
  readFileSync("src/components/network/offline-banner.tsx", "utf8"),
);
const layout = stripComments(
  readFileSync("src/app/dashboard/layout.tsx", "utf8"),
);

console.log("== 1. a server error is not a dead connection ==");
// The distinction the whole feature rests on. fetch rejects only when the
// request never completed; anything the server chose to send resolved.
check(
  "a Chrome transport failure counts",
  isNetworkError(new TypeError("Failed to fetch")),
);
check(
  "a Firefox one counts",
  isNetworkError(
    new TypeError("NetworkError when attempting to fetch resource."),
  ),
);
check("a Safari one counts", isNetworkError(new TypeError("Load failed")));
check("a plain Error does not", !isNetworkError(new Error("Failed to fetch")));
check("a string does not", !isNetworkError("Failed to fetch"));
check("null does not", !isNetworkError(null));
// A TypeError from a genuine type bug must not put the app in an offline
// state that only a reload clears.
check(
  "an unrelated TypeError does not",
  !isNetworkError(new TypeError("x.map is not a function")),
);
// The route replies this app actually sends — none of them is offline.
checkList(
  "no server-sent error is treated as offline",
  [
    new Error("Not enough credits for this question."),
    { ok: false, code: "pin_limit" },
    new Error("Too many questions in the last hour."),
  ]
    .filter((e) => isNetworkError(e))
    .map(String),
);

console.log("\n== 2. how old the data is, in a number worth printing ==");
const now = 1_700_000_000_000;
check(
  "under a minute says nothing",
  stalenessMinutes(now - 30_000, now) === null,
);
check("a minute is a minute", stalenessMinutes(now - 60_000, now) === 1);
check("nine minutes is nine", stalenessMinutes(now - 9 * 60_000, now) === 9);
check(
  "it rounds down rather than up",
  stalenessMinutes(now - 119_000, now) === 1,
);
// A clock skew that puts the load in the future must not print "-3 min".
check(
  "a future timestamp says nothing",
  stalenessMinutes(now + 60_000, now) === null,
);
check("and neither does nonsense", stalenessMinutes(NaN, now) === null);

console.log("\n== 3. onLine is believed only when it says false ==");
check(
  "false from the browser is offline",
  /navigator\.onLine === false\) return true/.test(status),
);
// The failure this prevents: an `online` event fires as the phone
// reconnects to a hotel wifi that has not been logged into yet, the
// banner disappears, and every request still fails.
check(
  "recovery is not declared from an online event",
  !/addEventListener\("online", reportNetworkSuccess/.test(status),
);
check(
  "it takes a completed request to clear it",
  /export function reportNetworkSuccess/.test(status) &&
    /reportedOffline = false/.test(status),
);
check(
  "or a probe that reached the server",
  /export async function probeReachable/.test(status),
);
// The probe must not be answerable from cache, or "try again" says yes
// while the network is still down.
check("the probe bypasses the cache", /cache: "no-store"/.test(status));
check(
  "and asks for something the service worker leaves alone",
  /manifest\.webmanifest/.test(status),
);
check(
  "a failed report only counts transport failures",
  /if \(!isNetworkError\(error\)\) return;/.test(status),
);
// Listeners are removed when the last subscriber goes, or a page full of
// mounts leaves window listeners behind forever.
check(
  "listeners are unbound when the last one leaves",
  /if \(typeof window !== "undefined" && listeners\.size === 0\)/.test(status),
);

console.log(
  "\n== 4. the banner says what happened, what they see, what to do ==",
);
check(
  "it renders nothing while the connection is fine",
  /if \(!offline\) return null;/.test(banner),
);
check("what happened", /t\("title"\)/.test(banner));
check(
  "what they are looking at",
  /showingCached|showingCachedAge/.test(banner),
);
check("and one button", /data-testid="offline-retry"/.test(banner));
// A retry that quietly does nothing is indistinguishable from a broken
// button, and the user's next move depends on knowing which it was.
check(
  "the retry actually checks the server",
  /await probeReachable\(\)/.test(banner),
);
check(
  "a failed retry says so",
  /data-testid="offline-retry-failed"/.test(banner),
);
check(
  "and a successful one reloads the page's data",
  /router\.refresh\(\)/.test(banner),
);
check(
  "the age is reset when it does",
  /loadedAtRef\.current = Date\.now\(\)/.test(banner),
);
// Stale content the reader cannot see the warning about is the whole bug.
check("the banner is announced", /role="alert"/.test(banner));
check("and stays visible while the page scrolls", /sticky top-0/.test(banner));
// A per-second clock on a healthy page is a render a second for a number
// nobody is reading.
check(
  "the age ticks once a minute, and only while offline",
  /if \(!offline\) \{[\s\S]{0,80}return;[\s\S]{0,200}setInterval\(update, 60_000\)/.test(
    banner,
  ),
);
check("the interval is cleared", /clearInterval\(timer\)/.test(banner));

console.log("\n== 5. every page that loads data has it ==");
// One place, so it cannot appear somewhere different on each page — the
// same argument PageHeader makes for the help "?".
check("mounted in the dashboard layout", /<OfflineBanner \/>/.test(layout));
check(
  "above the page content",
  layout.indexOf("<OfflineBanner />") < layout.indexOf("<PageTransition>"),
);
// And the pages themselves are unchanged: a banner that each page had to
// remember is a banner half the pages would not have.
const PAGES = [
  "src/app/dashboard/overview/page.tsx",
  "src/app/dashboard/files/page.tsx",
  "src/app/dashboard/chat/page.tsx",
];
checkList(
  "no page mounts its own",
  PAGES.filter((f) => /OfflineBanner/.test(readFileSync(f, "utf8"))),
);

console.log("\n== 6. the app tells it when a request fails ==");
// navigator.onLine alone would leave a captive-portal user staring at a
// page that silently stopped updating, so real requests report in too.
const startWatch = stripComments(
  readFileSync("src/lib/jobs/start-and-watch.ts", "utf8"),
);
const authRetry = stripComments(
  readFileSync("src/lib/fetch-with-auth-retry.ts", "utf8"),
);
check(
  "every AI action reports a transport failure",
  /reportNetworkFailure\(error\)/.test(startWatch),
);
check(
  "and a completed request clears it",
  /reportNetworkSuccess\(\)/.test(startWatch),
);
// A dropped poll must not swallow the evidence — that is the case where
// the user is watching a progress line that stopped moving.
check(
  "a dropped poll reports rather than swallowing",
  /reportNetworkFailure\(error\);\s*continue;/.test(startWatch),
);
check(
  "the multi-step flows report too",
  /reportNetworkFailure\(error\)/.test(authRetry),
);
// The failure must still reach the caller: reporting is not handling.
check(
  "and the error is rethrown, not eaten",
  /reportNetworkFailure\(error\);\s*throw error;/.test(startWatch),
);

console.log("\n== 7. it is readable in all ten languages ==");
const PARTS = [
  "title",
  "showingCached",
  "showingCachedAge",
  "retry",
  "checking",
  "stillOffline",
];
checkList(
  "every part exists everywhere",
  LOCALES.flatMap((l) =>
    PARTS.filter(
      (k) => typeof messages[l].common.offline?.[k] !== "string",
    ).map((k) => `${l}.${k}`),
  ),
);
// CARRIES THE NUMBER — proven by rendering, not by looking for `{minutes}`.
// Greek and Arabic spell the word "minute" out and therefore inflect it, so
// the placeholder there is `{minutes, plural, ...}` and a substring check for
// `{minutes}` reported the more careful sentence as the broken one. What is
// actually claimed is that the reader is told HOW OLD this is: change the
// number, change the sentence.
checkList(
  "the age sentence carries the number",
  LOCALES.filter(
    (l) =>
      !carriesNumber(createTranslator, {
        locale: l,
        messages: messages[l],
        namespace: "common.offline",
        key: "showingCachedAge",
        variable: "minutes",
      }),
  ),
);
checkList(
  "and nothing is left in English",
  LOCALES.filter((l) => l !== "en").filter(
    (l) =>
      messages[l].common.offline.title === messages.en.common.offline.title,
  ),
);
// ---------------------------------------------------------------------
// THE LAST-RESORT PAGE — the OTHER case, a navigation with nothing cached.
//
// THESE TWO CHECKS USED TO PIN A BUG. They asserted that the page still
// said "You&apos;re offline" in English and still carried a comment
// explaining that "the locale it would need comes from the request that
// just failed". Both passed for months. The excuse was false, and because
// the gate required it, fixing the page meant turning this file red — the
// exact shape of a check that protects a defect.
//
// The page is never RENDERED offline. It is fetched once, over the
// network, by the service worker's install handler — `cache.add("/offline")`,
// a same-origin request carrying the NEXT_LOCALE cookie like any other —
// and what a phone shows offline is that already-rendered HTML. The locale
// was available at the one moment the page is ever built.
//
// So the checks are now about the three things that have to be true for a
// Greek reader to meet a Greek page with no connection:
//   1. the page resolves its words through next-intl;
//   2. the worker can still FIND the cached copy once the response varies;
//   3. changing language re-fetches it, because the install-time copy is
//      otherwise frozen for the life of the worker.
const offlinePage = readFileSync("src/app/offline/page.tsx", "utf8");
// THE COMPONENT, NOT THE METADATA. The first version of this asked
// whether the file mentioned getTranslations anywhere, and
// offline-locale.mutation.mjs killed it: generateMetadata calls it too, so
// the page body could go back to `const t = (k) => k` — rendering raw key
// paths at a reader — with this check still green. What has to resolve
// through next-intl is the thing a person looks at.
check(
  "the last-resort page resolves its words through next-intl",
  /export default async function OfflinePage\(\)[\s\S]{0,120}?getTranslations\("common"\)/.test(
    offlinePage,
  ),
);
checkList(
  "...and carries no English sentence of its own",
  [/You&apos;re offline/, /needs a connection to load/, /Try again</].filter((re) =>
    re.test(offlinePage),
  ).map(String),
);
checkList(
  "...and its three keys exist in all ten languages",
  LOCALES.flatMap((l) =>
    ["title", "lastResortBody", "retry"]
      .filter((k) => typeof messages[l].common.offline[k] !== "string")
      .map((k) => `${l}.${k}`),
  ),
);
check(
  "...and it stays server-rendered, because its own JS chunk is not cached",
  !/"use client"/.test(offlinePage),
);

const sw = readFileSync("public/sw.js", "utf8");
check(
  "the worker finds the offline shell even when the response varies",
  /caches\.match\(OFFLINE_URL, \{ ignoreVary: true \}\)/.test(sw),
);
check(
  "...and re-fetches it when somebody changes language",
  /"refresh-offline"/.test(sw) && /cache\.add\(OFFLINE_URL\)/.test(sw),
);
const localePref = readFileSync("src/lib/locale-preference.ts", "utf8");
check(
  "...which is asked for on every language change, not only on sign-in",
  /postMessage\(\{ type: "refresh-offline" \}\)/.test(localePref) &&
    /refreshOfflineShell\(\);/.test(localePref),
);

console.log(
  `\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`,
);
process.exit(failures.length === 0 ? 0 : 1);
