// Basic, best-effort security scan for Website Builder's generated HTML —
// a second, independent layer on top of the existing sandboxed preview
// iframe (sandbox="" — no scripts, no same-origin, nothing executes in
// the in-app preview regardless of what's in the HTML). This scan matters
// for the DOWNLOADED file, which a user can host anywhere with no sandbox
// at all: it flags markup that violates this app's own generation
// contract (lib/website-builder.ts's system prompts) — external
// <script src> from unknown domains, inline event handlers, and forms
// posting to unknown external URLs (anything other than this app's own
// /api/websites/.../submit-form endpoint). Pure/dependency-free so it's
// unit-testable without a live generation.
//
// TODO V3: Consider dedicated content moderation API (e.g. OpenAI
// Moderation API or similar) for more robust protection at scale — this
// scan only catches structural/technical issues (script tags, handlers,
// form targets), not the semantic content of the generated page itself.

export type SecurityScanIssue =
  | { type: "external_script"; src: string }
  | { type: "inline_event_handler"; attribute: string }
  | { type: "external_form_target"; action: string }
  | { type: "external_iframe"; src: string }
  | { type: "dynamic_code_execution"; snippet: string };

// The app's own form endpoint, as a PATH. Matched against a parsed URL's
// pathname, never against the whole URL string — see isExternalFormTarget.
const FORM_ACTION_PATH_PREFIX = "/api/websites/";
const FORM_ACTION_PATH_SUFFIX = "/submit-form";

const SCRIPT_SRC_RE = /<script\b[^>]*\bsrc="([^"]*)"[^>]*>/gi;
// Captures the full attribute (name="value") so its VALUE can be checked
// against SUSPICIOUS_HANDLER_CONTENT_RE below — a plain UI interaction
// (toggling a class, smooth-scrolling to a section) is completely
// ordinary in generated marketing/business sites (mobile menu toggles,
// smooth-scroll nav) and has no business being flagged the same as a
// handler that actually reaches out to the network or touches
// cookies/storage. Only handlers whose VALUE contains one of those real
// risk indicators are still flagged.
const INLINE_HANDLER_RE = /\son(?:click|load|error|mouseover|mouseenter|focus|blur|submit|change|input)\s*=\s*"([^"]*)"/gi;
const SUSPICIOUS_HANDLER_CONTENT_RE =
  /\bfetch\s*\(|\bXMLHttpRequest\b|\beval\s*\(|\bnew\s+Function\s*\(|\bdocument\.cookie\b|\bwindow\.location\s*=|\blocalStorage\b|\bsessionStorage\b|\bimport\s*\(/i;
const FORM_ACTION_RE = /<form\b[^>]*\baction="([^"]*)"[^>]*>/gi;
// A generated page has a few real, legitimate reasons to embed another
// site via <iframe> — a Google Maps location embed for a physical
// business, or a YouTube/Vimeo video — so those specific, well-known
// domains are allowed through; anything else still has no legitimate
// use in this app's generation contract and is flagged.
const IFRAME_SRC_RE = /<iframe\b[^>]*\bsrc="([^"]*)"[^>]*>/gi;

/**
 * The embeds a generated page may carry, as EXACT hosts.
 *
 * THIS IS ALSO THE CSP's frame-src. lib/publishing/public-serving.ts
 * builds that directive from this array rather than repeating it, because
 * the previous arrangement was two hand-written lists with a comment
 * claiming they could not disagree — and they did: the scan allowed
 * "youtube.com" with no subdomain, which the CSP's
 * `https://www.youtube.com` blocks. A page could pass the scan, get
 * published, and then fail to render its own video with no error anywhere.
 */
export const ALLOWED_IFRAME_EMBEDS: readonly { host: string; pathPrefix?: string }[] = [
  { host: "www.google.com", pathPrefix: "/maps" },
  { host: "maps.google.com" },
  { host: "www.youtube.com" },
  { host: "www.youtube-nocookie.com" },
  { host: "player.vimeo.com" },
];

/**
 * An absolute http(s) URL, or null for anything else.
 *
 * `javascript:`, `data:` and a bare relative path all come back null and
 * are handled by the caller — an iframe with any of those is not an
 * allowed embed, and a relative form action is not an external target.
 */
function parseHttpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * WHAT WAS WRONG, and it is the whole reason this function exists.
 *
 * The check was `ALLOWED_IFRAME_HOSTS.some((host) => src.includes(host))`.
 * A substring test against the whole URL string, so every one of these
 * passed as "YouTube":
 *
 *     https://youtube.com.attacker.net/frame     host is attacker.net
 *     https://notyoutube.com/frame               host is notyoutube.com
 *     https://evil.example/?ref=youtube.com      host is evil.example
 *     https://youtube.com@evil.example/frame     host is evil.example
 *
 * The last one is the classic: everything before the @ is userinfo, not a
 * host, and a reader scanning the string sees "youtube.com" first.
 *
 * The URL is parsed now and the HOSTNAME is compared exactly. No subdomain
 * wildcard either — the CSP names exact origins, and a scan that is looser
 * than the CSP passes pages the browser then refuses to render.
 */
function isAllowedIframeSrc(src: string): boolean {
  const url = parseHttpUrl(src);
  if (!url) return false;
  const hostname = url.hostname.toLowerCase();
  return ALLOWED_IFRAME_EMBEDS.some(
    (embed) =>
      hostname === embed.host &&
      (!embed.pathPrefix ||
        url.pathname === embed.pathPrefix ||
        url.pathname.startsWith(`${embed.pathPrefix}/`))
  );
}

/**
 * Does this form post a visitor's details somewhere that is not us?
 *
 * SAME BUG, SAME SHAPE. The check was
 * `!action.includes("/api/websites/")`, so a form posting to
 *
 *     https://evil.example/collect?next=/api/websites/x/submit-form
 *
 * contained the allowed substring in its QUERY STRING and was waved
 * through. On a published page the CSP's `form-action 'self'` stops it
 * anyway — but this scan exists for the DOWNLOADED file, which the user
 * can host anywhere with no CSP at all, and it is also the gate that
 * decides whether a page may be published in the first place.
 *
 * The pathname is what is checked now, and when the caller knows the app's
 * own host (the routes pass it) the host must match too — otherwise
 * https://evil.example/api/websites/x/submit-form would still read as ours.
 *
 * A RELATIVE action is not an external target and is not flagged, exactly
 * as before: it posts to whatever origin the page is served from, which is
 * the site's own.
 */
function isExternalFormTarget(action: string, appHost?: string): boolean {
  const raw = action.trim();
  const url = parseHttpUrl(raw);

  if (!url) {
    // A scheme that is not http(s) — javascript:, data:, vbscript:. Not
    // "external" in the exfiltration sense, but it is not a form target
    // this app's generation contract permits either, and the old check
    // ignored it entirely.
    return /^[a-z][a-z0-9+.-]*:/i.test(raw) && !raw.startsWith("//");
  }

  const pathOk =
    url.pathname.startsWith(FORM_ACTION_PATH_PREFIX) &&
    url.pathname.endsWith(FORM_ACTION_PATH_SUFFIX);
  if (!pathOk) return true;
  if (!appHost) return false;
  return url.hostname.toLowerCase() !== appHost.toLowerCase();
}
// eval(...) / new Function(...) — no legitimate use in a static
// marketing/business site's generated JS, and both are classic vectors
// for obfuscated/dynamically-assembled malicious payloads that would
// evade the other, more literal checks above.
const DYNAMIC_CODE_RE = /\b(?:eval\s*\(|new\s+Function\s*\()/g;

export function scanWebsiteHtmlForSecurityIssues(
  html: string,
  options: { appHost?: string } = {}
): SecurityScanIssue[] {
  const issues: SecurityScanIssue[] = [];
  let match: RegExpExecArray | null;

  SCRIPT_SRC_RE.lastIndex = 0;
  while ((match = SCRIPT_SRC_RE.exec(html))) {
    issues.push({ type: "external_script", src: match[1] });
  }

  INLINE_HANDLER_RE.lastIndex = 0;
  while ((match = INLINE_HANDLER_RE.exec(html))) {
    const handlerValue = match[1];
    if (SUSPICIOUS_HANDLER_CONTENT_RE.test(handlerValue)) {
      issues.push({ type: "inline_event_handler", attribute: match[0].trim() });
    }
  }

  FORM_ACTION_RE.lastIndex = 0;
  while ((match = FORM_ACTION_RE.exec(html))) {
    const action = match[1];
    if (isExternalFormTarget(action, options.appHost)) {
      issues.push({ type: "external_form_target", action });
    }
  }

  IFRAME_SRC_RE.lastIndex = 0;
  while ((match = IFRAME_SRC_RE.exec(html))) {
    const src = match[1];
    if (!isAllowedIframeSrc(src)) {
      issues.push({ type: "external_iframe", src });
    }
  }

  DYNAMIC_CODE_RE.lastIndex = 0;
  while ((match = DYNAMIC_CODE_RE.exec(html))) {
    issues.push({ type: "dynamic_code_execution", snippet: match[0] });
  }

  return issues;
}

// One short, human-readable line per issue — used both for the
// error_message shown to the user on a flagged website and for the
// security_check_log entry (lib/security-check-log.ts), so the same
// wording appears in both places.
export function describeSecurityScanIssue(issue: SecurityScanIssue): string {
  switch (issue.type) {
    case "external_script":
      return `External script tag pointing to an unknown domain (${issue.src || "no src"})`;
    case "inline_event_handler":
      return `Inline event handler attribute (${issue.attribute})`;
    case "external_form_target":
      return `Form submitting to an external, non-Ionexa-AI URL (${issue.action})`;
    case "external_iframe":
      return `Iframe embedding an external domain (${issue.src || "no src"})`;
    case "dynamic_code_execution":
      return `Dynamic code execution (${issue.snippet})`;
  }
}

// Actively strips any <script src="..."> tag pointing outside this app's
// own domain-independent contract (the system prompt never asks for one,
// so removing it can only ever remove something that shouldn't have been
// there — unlike inline handlers or form actions, which are riskier to
// auto-rewrite without potentially breaking legitimate generated markup,
// this one is safe to remove outright rather than just flag).
export function stripDisallowedExternalScripts(html: string): string {
  return html.replace(SCRIPT_SRC_RE, "");
}
