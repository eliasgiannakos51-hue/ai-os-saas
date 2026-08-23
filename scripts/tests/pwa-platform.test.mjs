// Which device is this, and what may we offer it?
//
// The bug these tests exist for: the install invitation lived inside the
// `beforeinstallprompt` handler, and Safari never fires that event. Every
// iPhone therefore fell through to nothing — no invitation, and because
// iOS grants Web Push only to a Home-Screen app, no notifications either.
// The decision now starts from the device, so the device detection is
// load-bearing and gets a real user-agent table rather than a guess.
//
// Run: node scripts/tests/pwa-platform.test.mjs
import { loadTs } from "./load-ts.mjs";

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

const { detectPlatform, detectBrowser, installSurface, isApplePhoneOrTablet, isInstalledDisplayMode } =
  await loadTs("src/lib/pwa/platform.ts");

// Real strings, copied from real browsers. Nothing here is invented: a
// hand-written user agent would agree with a hand-written parser and
// prove nothing.
const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0.6261.89 Mobile/15E148 Safari/604.1",
  iphoneFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/124.0 Mobile/15E148 Safari/605.1.15",
  ipadLegacy:
    "Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
  ipadModern:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
  windowsFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
  linuxFirefox: "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0",
  chromeOS:
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

console.log("== 1. platform, from real user agents ==");
check("iPhone Safari → ios", detectPlatform(UA.iphoneSafari) === "ios");
check("iPhone Chrome → ios", detectPlatform(UA.iphoneChrome) === "ios");
check("iPad on iOS 15 → ipados", detectPlatform(UA.ipadLegacy) === "ipados");
check("Android Chrome → android", detectPlatform(UA.androidChrome) === "android");
check("Windows Edge → windows", detectPlatform(UA.windowsEdge) === "windows");
check("Linux Firefox → linux", detectPlatform(UA.linuxFirefox) === "linux");
check("ChromeOS → linux", detectPlatform(UA.chromeOS) === "linux");
check("empty string → other", detectPlatform("") === "other");

console.log("\n== 2. THE IPAD TRAP: same user agent, different device ==");
// Since iPadOS 13 an iPad sends a Mac user agent, byte for byte. If this
// is wrong, every iPad is counted as a desktop — precisely backwards for a
// question about Safari, install prompts and web push.
check(
  "the two strings really are identical (so only touch can tell them apart)",
  UA.ipadModern === UA.macSafari
);
check(
  "Mac UA + touchscreen → ipados",
  detectPlatform(UA.ipadModern, { maxTouchPoints: 5 }) === "ipados"
);
check(
  "Mac UA + no touchscreen → macos",
  detectPlatform(UA.macSafari, { maxTouchPoints: 0 }) === "macos"
);
check(
  "a Mac with a trackpad still reports 0 touch points → macos",
  detectPlatform(UA.macChrome, { maxTouchPoints: 0 }) === "macos"
);
check(
  "maxTouchPoints 1 is NOT an iPad (a single-touch display is not iPadOS)",
  detectPlatform(UA.macSafari, { maxTouchPoints: 1 }) === "macos"
);
check(
  "the platform hint alone can carry it when the UA is frozen",
  detectPlatform("", { maxTouchPoints: 5, platformHint: "MacIntel" }) === "ipados"
);

console.log("\n== 3. browser family, in the only order that works ==");
// Every Chromium user agent contains "Safari"; Edge's contains "Chrome"
// too. Test Safari first and every desktop Chrome reports as Safari.
check("Chrome on Mac → chromium", detectBrowser(UA.macChrome) === "chromium");
check("Edge → chromium (not safari, not 'other')", detectBrowser(UA.windowsEdge) === "chromium");
check("Samsung Internet → chromium", detectBrowser(UA.androidSamsung) === "chromium");
check("Chrome on iOS (CriOS) → chromium", detectBrowser(UA.iphoneChrome) === "chromium");
check("Firefox → firefox", detectBrowser(UA.windowsFirefox) === "firefox");
check("Firefox on iOS (FxiOS) → firefox", detectBrowser(UA.iphoneFirefox) === "firefox");
check("Safari on Mac → safari", detectBrowser(UA.macSafari) === "safari");
check("Safari on iPhone → safari", detectBrowser(UA.iphoneSafari) === "safari");
check("nonsense → other", detectBrowser("curl/8.1.2") === "other");

console.log("\n== 4. installed means 'not in a tab' ==");
check("standalone is installed", isInstalledDisplayMode("standalone") === true);
check("fullscreen is installed", isInstalledDisplayMode("fullscreen") === true);
check("minimal-ui is installed", isInstalledDisplayMode("minimal-ui") === true);
check(
  "window-controls-overlay is installed (a desktop PWA, easily missed)",
  isInstalledDisplayMode("window-controls-overlay") === true
);
check("browser is NOT installed", isInstalledDisplayMode("browser") === false);

console.log("\n== 5. which invitation the device gets ==");
const surface = (platform, displayMode, hasNativePrompt) =>
  installSurface({ platform, displayMode, hasNativePrompt });

check("Android with the event → native", surface("android", "browser", true) === "native");
check("Windows with the event → native", surface("windows", "browser", true) === "native");
// THE ONE THAT WAS BROKEN.
check(
  "iPhone, no event (Safari never fires one) → ios instructions",
  surface("ios", "browser", false) === "ios"
);
check("iPad, no event → ios instructions", surface("ipados", "browser", false) === "ios");
check(
  "an installed iPhone is offered nothing",
  surface("ios", "standalone", false) === "none"
);
check(
  "an installed Android is offered nothing, even if the event fires",
  surface("android", "standalone", true) === "none"
);
check(
  "a desktop that cannot install is offered nothing rather than dead instructions",
  surface("windows", "browser", false) === "none"
);
check(
  "iOS beats the missing event, but installed beats everything",
  surface("ios", "minimal-ui", false) === "none"
);
check("isApplePhoneOrTablet covers both", isApplePhoneOrTablet("ios") && isApplePhoneOrTablet("ipados"));
check("...and nothing else", !isApplePhoneOrTablet("macos") && !isApplePhoneOrTablet("android"));

console.log("\n== 6. the cross-product, not a sample ==");
// Every platform x every display mode x event/no event. The assertion is
// the RULE, restated independently: an installed device is never invited,
// an Apple handheld always gets instructions, everything else needs the
// event. If the implementation and this loop ever disagree, one of them
// is wrong and the test says which combination.
const PLATFORMS = ["ios", "ipados", "android", "macos", "windows", "linux", "other"];
const MODES = ["standalone", "minimal-ui", "fullscreen", "window-controls-overlay", "browser"];
let mismatches = [];
for (const platform of PLATFORMS) {
  for (const mode of MODES) {
    for (const hasEvent of [true, false]) {
      const actual = surface(platform, mode, hasEvent);
      const expected =
        mode !== "browser"
          ? "none"
          : hasEvent
            ? "native"
            : platform === "ios" || platform === "ipados"
              ? "ios"
              : "none";
      if (actual !== expected) mismatches.push(`${platform}/${mode}/${hasEvent}: ${actual} != ${expected}`);
    }
  }
}
check(
  `all ${PLATFORMS.length * MODES.length * 2} combinations agree with the rule`,
  mismatches.length === 0,
  mismatches.slice(0, 5).join("\n        ")
);

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ` + failures.join("\n  - ")
);
process.exit(failures.length === 0 ? 0 : 1);
