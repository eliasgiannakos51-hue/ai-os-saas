// PWA coverage: install-prompt timing, service-worker caching rules,
// manifest completeness, and the push wiring.
//
// The timing rule is the part with real logic, so it is exercised as a
// pure function against hand-built state rather than by installing a PWA
// by hand. The rest are structural checks on files whose mistakes are
// silent (a service worker that caches /api responses looks fine until a
// user sees a stale credit balance).
//
// Run: node scripts/tests/pwa.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const m = await loadTs("src/lib/pwa/install-prompt.ts");
const {
  EMPTY_INSTALL_STATE,
  recordVisit,
  shouldShowInstallPrompt,
  parseInstallState,
  INSTALL_PROMPT_MIN_VISITS,
  INSTALL_PROMPT_VISIT_GAP_MS,
  INSTALL_PROMPT_SNOOZE_DAYS,
} = m;

console.log("== 1. the prompt does NOT appear on the first visit ==");
const T0 = 1_700_000_000_000;
const CAN = { alreadyInstalled: false, canPrompt: true };
let state = recordVisit(EMPTY_INSTALL_STATE, T0);
check("visit 1 recorded", state.visits === 1);
check("no prompt after 1 visit", shouldShowInstallPrompt(state, T0, CAN) === false);

console.log("\n== 2. rapid page loads are ONE visit, not three ==");
// This is the bug the gap check exists for: without it, a user clicking
// around the dashboard hits the threshold in their first minute.
let rapid = state;
rapid = recordVisit(rapid, T0 + 60_000);
rapid = recordVisit(rapid, T0 + 120_000);
check("three loads within the gap stay at 1 visit", rapid.visits === 1, `visits=${rapid.visits}`);
check("still no prompt", shouldShowInstallPrompt(rapid, T0 + 120_000, CAN) === false);

console.log("\n== 3. the prompt appears on the third genuine visit ==");
const DAY = 24 * 60 * 60 * 1000;
let returning = recordVisit(EMPTY_INSTALL_STATE, T0);
returning = recordVisit(returning, T0 + DAY);
check(`after 2 visits, still silent (min is ${INSTALL_PROMPT_MIN_VISITS})`, shouldShowInstallPrompt(returning, T0 + DAY, CAN) === false);
returning = recordVisit(returning, T0 + 2 * DAY);
check("visit 3 recorded", returning.visits === 3);
check("prompt shows on visit 3", shouldShowInstallPrompt(returning, T0 + 2 * DAY, CAN) === true);
check("gap constant is 30 minutes", INSTALL_PROMPT_VISIT_GAP_MS === 30 * 60 * 1000);

console.log("\n== 4. 'not now' is respected, and eventually expires ==");
const dismissed = { ...returning, dismissedAt: T0 + 2 * DAY };
check("silent right after dismissal", shouldShowInstallPrompt(dismissed, T0 + 2 * DAY + 1000, CAN) === false);
check(
  `still silent 1 day later (snooze is ${INSTALL_PROMPT_SNOOZE_DAYS} days)`,
  shouldShowInstallPrompt(dismissed, T0 + 3 * DAY, CAN) === false
);
check(
  "returns after the snooze expires",
  shouldShowInstallPrompt(dismissed, T0 + 2 * DAY + (INSTALL_PROMPT_SNOOZE_DAYS + 1) * DAY, CAN) === true
);

console.log("\n== 5. never prompt when there is nothing to install ==");
check("already installed (standalone)", shouldShowInstallPrompt(returning, T0 + 2 * DAY, { alreadyInstalled: true, canPrompt: true }) === false);
check("no beforeinstallprompt event", shouldShowInstallPrompt(returning, T0 + 2 * DAY, { alreadyInstalled: false, canPrompt: false }) === false);
check("installed flag sticks", shouldShowInstallPrompt({ ...returning, installed: true }, T0 + 2 * DAY, CAN) === false);

console.log("\n== 6. corrupt stored state degrades to 'no history', never a crash ==");
check("null", parseInstallState(null).visits === 0);
check("garbage", parseInstallState("{{{").visits === 0);
check("negative visits are rejected", parseInstallState('{"visits":-5}').visits === 0);
check("wrong types are rejected", parseInstallState('{"visits":"lots"}').visits === 0);

console.log("\n== 7. the service worker's caching rules ==");
const sw = readFileSync("public/sw.js", "utf8");
check("API responses are never cached", /url\.pathname\.startsWith\("\/api\/"\)/.test(sw) && /return;/.test(sw));
check("auth callbacks are never cached", /startsWith\("\/auth\/"\)/.test(sw));
check("non-GET requests are ignored", /request\.method !== "GET"/.test(sw));
check("cross-origin requests are left alone", /url\.origin !== self\.location\.origin/.test(sw));
check("navigations are network-FIRST (personalised pages)", /request\.mode === "navigate"/.test(sw) && /await fetch\(request\)/.test(sw));
check("with an offline fallback", /OFFLINE_URL/.test(sw) && /caches\.match\(OFFLINE_URL\)/.test(sw));
check("static assets are cache-first", /isStaticAsset/.test(sw));
check("old versions are purged on activate", /caches\.delete/.test(sw));
check("install cannot be broken by one missing asset", /cache\.add\(url\)\.catch/.test(sw));
check("push handler renders a notification", /addEventListener\("push"/.test(sw) && /showNotification/.test(sw));
check("notificationclick focuses an existing tab", /notificationclick/.test(sw) && /matchAll/.test(sw));

console.log("\n== 8. manifest is genuinely installable ==");
const manifest = readFileSync("src/app/manifest.ts", "utf8");
check("standalone display", /display: "standalone"/.test(manifest));
check("start_url + scope", /start_url/.test(manifest) && /scope: "\/"/.test(manifest));
check("theme + background colours", /theme_color/.test(manifest) && /background_color/.test(manifest));
check("a MASKABLE icon exists (Android crops to its own shape)", /purpose: "maskable"/.test(manifest));
check("app shortcuts", /shortcuts:/.test(manifest));
// The maskable icon must actually be on disk, or the manifest points at a 404.
const { existsSync, statSync } = await import("node:fs");
check("the maskable icon file exists", existsSync("public/icon-maskable.png") && statSync("public/icon-maskable.png").size > 1000);
check("the offline page exists", existsSync("src/app/offline/page.tsx"));

console.log("\n== 9. push is wired into the three promised triggers ==");
const WIRING = [
  ["src/lib/agents/execute-agent.ts", "agent_results"],
  ["src/lib/agents/execute-agent.ts", "low_credits"],
  ["src/app/api/cron/scheduled-runs/route.ts", "mission_reminders"],
];
for (const [file, type] of WIRING) {
  const src = readFileSync(file, "utf8");
  check(`${file.replace("src/", "")} sends "${type}"`, new RegExp(`sendPushToUser\\([^)]*"${type}"`).test(src.replace(/\n/g, " ")));
}
const push = readFileSync("src/lib/push/web-push.ts", "utf8");
check("sends are per-type opt-in filtered", /\.eq\(column, true\)/.test(push));
check("dead subscriptions (404/410) are revoked, not retried forever", /status === 404 \|\| status === 410/.test(push));
check("an unconfigured deployment is a no-op, not a crash", /skipped = "unconfigured"/.test(push));
const route = readFileSync("src/app/api/push/subscribe/route.ts", "utf8");
check("only https endpoints are stored", /startsWith\("https:\/\/"\)/.test(route));
check("the row is stamped with the CALLER's user id", /user_id: user\.id/.test(route));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
