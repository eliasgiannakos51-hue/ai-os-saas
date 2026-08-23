/**
 * Which device this is, in the few words the install decision needs.
 *
 * Pure functions over strings and numbers, with no browser API touched, so
 * every branch can be tested against a real user-agent table instead of by
 * borrowing an iPhone. The component that uses them does the reading; this
 * does the deciding.
 *
 * NOTHING HERE IS A FINGERPRINT. Each function collapses its input to one
 * of a handful of fixed words — the user agent itself is never stored or
 * sent. That is a deliberate ceiling on what the telemetry can ever become.
 */

export type Platform = "ios" | "ipados" | "android" | "macos" | "windows" | "linux" | "other";
export type BrowserFamily = "safari" | "chromium" | "firefox" | "other";
export type DisplayMode =
  | "standalone"
  | "minimal-ui"
  | "fullscreen"
  | "window-controls-overlay"
  | "browser";

export const PLATFORMS: Platform[] = ["ios", "ipados", "android", "macos", "windows", "linux", "other"];
export const BROWSER_FAMILIES: BrowserFamily[] = ["safari", "chromium", "firefox", "other"];
export const DISPLAY_MODES: DisplayMode[] = [
  "standalone",
  "minimal-ui",
  "fullscreen",
  "window-controls-overlay",
  "browser",
];

/**
 * THE IPAD TRAP. Since iPadOS 13 an iPad reports itself as a Mac — same
 * user agent, down to "Macintosh; Intel Mac OS X". The only thing that
 * separates them is that the iPad has a touchscreen, so `maxTouchPoints`
 * is the whole test. Getting this wrong counts every iPad as a desktop,
 * which is precisely backwards for a question about Safari and install
 * prompts.
 */
export function detectPlatform(
  userAgent: string,
  opts: { maxTouchPoints?: number; platformHint?: string } = {}
): Platform {
  const ua = userAgent || "";
  const touch = opts.maxTouchPoints ?? 0;
  const hint = opts.platformHint ?? "";

  if (/iPhone|iPod/i.test(ua)) return "ios";
  if (/iPad/i.test(ua)) return "ipados";
  // An iPad on iPadOS 13+: a Mac user agent, but with a touchscreen. Real
  // Macs report maxTouchPoints 0 even with a trackpad.
  if ((/Macintosh/i.test(ua) || /^Mac/i.test(hint)) && touch > 1) return "ipados";
  if (/Android/i.test(ua)) return "android";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  if (/Windows/i.test(ua)) return "windows";
  if (/Linux|X11|CrOS/i.test(ua)) return "linux";
  return "other";
}

/**
 * Which engine family, tested in the only order that works.
 *
 * Every Chromium user agent contains the word "Safari", and Edge's
 * contains "Chrome" as well. Testing for Safari first — the obvious
 * reading — reports Chrome, Edge and Opera as Safari on every desktop.
 */
export function detectBrowser(userAgent: string): BrowserFamily {
  const ua = userAgent || "";
  if (/Firefox\/|FxiOS\//i.test(ua)) return "firefox";
  if (/Edg[A-Za-z]*\/|OPR\/|SamsungBrowser\/|CriOS\/|Chrome\/|Chromium\//i.test(ua)) return "chromium";
  if (/Safari\//i.test(ua)) return "safari";
  return "other";
}

/** True for the platforms where Safari's rules apply no matter which
 *  browser is on screen — on iOS every browser is WebKit. */
export function isApplePhoneOrTablet(platform: Platform): boolean {
  return platform === "ios" || platform === "ipados";
}

/** Installed means "not running in a tab". Anything other than `browser`
 *  is a launched app, and treating only `standalone` as installed would
 *  miss fullscreen and window-controls-overlay installs. */
export function isInstalledDisplayMode(mode: DisplayMode): boolean {
  return mode !== "browser";
}

export type InstallSurface = "native" | "ios" | "none";

/**
 * Which invitation, if any, this device should be shown.
 *
 * The three cases are genuinely different products:
 *
 *   `native` — the browser fired beforeinstallprompt, so a single button
 *   can do the whole thing.
 *
 *   `ios` — Safari NEVER fires that event and never offers installation on
 *   its own. Nothing we can call will install the app; the only thing that
 *   works is telling the person which three taps to make. Skipping this is
 *   why an iPhone user could not receive a single notification: iOS grants
 *   web push only to an app that was added to the Home Screen.
 *
 *   `none` — already installed, or a browser that cannot install at all,
 *   where an invitation would be an instruction that leads nowhere.
 */
export function installSurface(input: {
  platform: Platform;
  displayMode: DisplayMode;
  hasNativePrompt: boolean;
}): InstallSurface {
  if (isInstalledDisplayMode(input.displayMode)) return "none";
  if (input.hasNativePrompt) return "native";
  if (isApplePhoneOrTablet(input.platform)) return "ios";
  return "none";
}
