// Minimal, dependency-free User-Agent parsing — just enough to show
// "Chrome on macOS" in a security email, not real device detection. Order
// matters: Edge/Opera UAs also contain "Chrome", and Chrome's UA also
// contains "Safari", so the more specific checks must run first.
export function parseUserAgent(userAgent: string): {
  browser: string;
  os: string;
  label: string;
} {
  const ua = userAgent || "";

  const os = /Windows/i.test(ua)
    ? "Windows"
    : /Mac OS X/i.test(ua)
      ? "macOS"
      : /Android/i.test(ua)
        ? "Android"
        : /iPhone|iPad|iPod/i.test(ua)
          ? "iOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "an unknown device";

  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\//i.test(ua)
      ? "Opera"
      : /Chrome\//i.test(ua)
        ? "Chrome"
        : /Firefox\//i.test(ua)
          ? "Firefox"
          : /Safari\//i.test(ua)
            ? "Safari"
            : "an unknown browser";

  return { browser, os, label: `${browser} on ${os}` };
}
