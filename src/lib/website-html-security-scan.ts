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
  | { type: "external_form_target"; action: string };

const ALLOWED_FORM_ACTION_SUBSTRING = "/api/websites/";

const SCRIPT_SRC_RE = /<script\b[^>]*\bsrc="([^"]*)"[^>]*>/gi;
const INLINE_HANDLER_RE = /\son(?:click|load|error|mouseover|mouseenter|focus|blur|submit|change|input)\s*=/gi;
const FORM_ACTION_RE = /<form\b[^>]*\baction="([^"]*)"[^>]*>/gi;

export function scanWebsiteHtmlForSecurityIssues(html: string): SecurityScanIssue[] {
  const issues: SecurityScanIssue[] = [];
  let match: RegExpExecArray | null;

  SCRIPT_SRC_RE.lastIndex = 0;
  while ((match = SCRIPT_SRC_RE.exec(html))) {
    issues.push({ type: "external_script", src: match[1] });
  }

  INLINE_HANDLER_RE.lastIndex = 0;
  while ((match = INLINE_HANDLER_RE.exec(html))) {
    issues.push({ type: "inline_event_handler", attribute: match[0].trim() });
  }

  FORM_ACTION_RE.lastIndex = 0;
  while ((match = FORM_ACTION_RE.exec(html))) {
    const action = match[1];
    if ((action.startsWith("http://") || action.startsWith("https://")) && !action.includes(ALLOWED_FORM_ACTION_SUBSTRING)) {
      issues.push({ type: "external_form_target", action });
    }
  }

  return issues;
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
