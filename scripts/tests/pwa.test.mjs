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

console.log("\n== 10. every asset the manifest names is ON DISK, at the size it claims ==");
// THE CHECK THAT WAS MISSING. The manifest listed `/apple-icon` — but the
// Next file convention is apple-icon.PNG, so the served path carries the
// extension and that entry was a 404 in production for as long as it
// existed. Nothing caught it: the regex checks above only ask whether the
// FIELD is present, and a 404 icon is a present field. Resolving each src
// to a real file is what turns "declared" into "there".
const { default: buildManifest } = await loadTs("src/app/manifest.ts");
const appManifest = buildManifest();

/** Where a served path actually comes from: public/ for static files,
 *  src/app/ for the Next file conventions (icon.svg, apple-icon.png). */
function fileFor(src) {
  const candidates = [`public${src}`, `src/app${src}`];
  return candidates.find((c) => existsSync(c)) ?? null;
}
function pngSize(path) {
  const buf = readFileSync(path);
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
}
function jpegSize(path) {
  const buf = readFileSync(path);
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    // SOF0..SOF15, excluding the non-frame markers in that range.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return `${buf.readUInt16BE(i + 7)}x${buf.readUInt16BE(i + 5)}`;
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

for (const icon of appManifest.icons ?? []) {
  const file = fileFor(icon.src);
  check(`icon ${icon.src} exists`, file !== null, "no file under public/ or src/app/");
  if (!file || !file.endsWith(".png")) continue;
  const real = pngSize(file);
  check(`   ...and is really ${icon.sizes}`, real === icon.sizes, `file is ${real}`);
}

// Chromium counts only RASTER icons of purpose "any" toward installability;
// an SVG with sizes:"any" is legal and ignored. 192 is the floor, 512 is
// what the rich install dialog wants.
const raster = (appManifest.icons ?? []).filter(
  (i) => String(i.type ?? "").includes("png") && String(i.purpose ?? "any").includes("any")
);
const widths = raster.map((i) => Number(String(i.sizes).split("x")[0]) || 0);
check(`a >=192px purpose:any PNG (${widths.join(", ")})`, widths.some((w) => w >= 192));
check("a >=512px purpose:any PNG, for the rich install dialog", widths.some((w) => w >= 512));

check(`the manifest declares screenshots (${(appManifest.screenshots ?? []).length})`, (appManifest.screenshots ?? []).length > 0);
for (const shot of appManifest.screenshots ?? []) {
  const file = fileFor(shot.src);
  check(`screenshot ${shot.src} exists`, file !== null);
  if (!file) continue;
  const real = file.endsWith(".png") ? pngSize(file) : jpegSize(file);
  check(`   ...and is really ${shot.sizes}`, real === shot.sizes, `file is ${real}`);
}
// Chrome shows the desktop install preview only when a `wide` screenshot
// exists, and the phone one only for `narrow`. One without the other means
// half the users get the mini-infobar.
const forms = new Set((appManifest.screenshots ?? []).map((s) => s.form_factor));
check("both form factors are covered", forms.has("narrow") && forms.has("wide"), [...forms].join(", "));
// Chrome's own constraint: 320-3840px a side, longest no more than 2.3x
// the shortest. A screenshot outside it is dropped SILENTLY.
const badRatio = (appManifest.screenshots ?? []).filter((s) => {
  const [w, h] = String(s.sizes).split("x").map(Number);
  const [lo, hi] = [Math.min(w, h), Math.max(w, h)];
  return lo < 320 || hi > 3840 || hi / lo > 2.3;
});
check("every screenshot is inside Chrome's size/ratio limits", badRatio.length === 0, badRatio.map((s) => s.src).join(", "));

console.log("\n== 11. identity, and the two OS hand-offs ==");
check("the app id is PINNED (start_url is otherwise the identity)", typeof appManifest.id === "string" && appManifest.id.length > 0);
check(
  "...to the value it already had, so existing installs are not orphaned",
  appManifest.id === appManifest.start_url,
  `id=${appManifest.id} start_url=${appManifest.start_url}`
);
check("lang and dir are declared", appManifest.lang === "en" && appManifest.dir === "ltr");
check("a share arriving from the OS reuses the open window", appManifest.launch_handler?.client_mode === "navigate-existing");
check("share_target is declared", Boolean(appManifest.share_target));
check("file_handlers is declared", Array.isArray(appManifest.file_handlers) && appManifest.file_handlers.length > 0);

console.log("\n== 12. the two staleness leaks the audit found ==");
check(
  "the page cache is purged on EVERY activate, not only on a version bump",
  /n\.endsWith\("-pages"\)/.test(sw)
);
const provider = readFileSync("src/components/pwa/pwa-provider.tsx", "utf8");
check(
  "the worker is registered with a build stamp, so a deploy reaches it",
  /register\(`\/sw\.js\?build=/.test(provider)
);
const logout = readFileSync("src/components/logout-button.tsx", "utf8");
check(
  "signing out throws away the cached (personalised) pages",
  /clearPrivatePwaCaches/.test(logout)
);
const reset = readFileSync("src/lib/pwa/cache-reset.ts", "utf8");
check(
  "...the page cache only — hashed static assets are public and stay",
  /includes\("-pages"\)/.test(reset)
);

console.log("\n== 13. the install invitation reaches iPhone ==");
check(
  "the decision is made from the DEVICE, not from the browser event",
  /installSurface\(/.test(provider) && /device\.current/.test(provider)
);
const invitation = readFileSync("src/components/pwa/install-invitation.tsx", "utf8");
check("there is an iOS surface at all", /surface === "ios"/.test(invitation));
check("...with the three taps spelled out", /iosStep1/.test(invitation) && /iosStep2/.test(invitation) && /iosStep3/.test(invitation));
check("...and what iOS loses until then", /iosWhy/.test(invitation));
const settings = readFileSync("src/app/dashboard/settings/page.tsx", "utf8");
check(
  "and a PERMANENT way in, for anyone who said 'not now'",
  /<InstallSection \/>/.test(settings)
);

console.log("\n== 14. push settings tell the truth about themselves ==");
const pushRoute = readFileSync("src/app/api/push/subscribe/route.ts", "utf8");
check("the per-type opt-in can be READ, not just written", /export async function GET/.test(pushRoute));
const panel = readFileSync("src/components/settings/push-notification-settings.tsx", "utf8");
check(
  "...and the panel loads it instead of drawing every toggle on",
  /\/api\/push\/subscribe\?endpoint=/.test(panel)
);
check(
  "Notification is checked for existence — it is ABSENT on iOS Safari",
  /typeof Notification !== "undefined"/.test(panel)
);
check("an iPhone is told why notifications cannot work yet", /iosNeedsInstall/.test(panel));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
