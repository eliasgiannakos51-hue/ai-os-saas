import "server-only";
import {
  scanWebsiteHtmlForSecurityIssues,
  describeSecurityScanIssue,
  stripDisallowedExternalScripts,
} from "@/lib/website-html-security-scan";
import { UNTRUSTED_CLOSE, UNTRUSTED_OPEN } from "@/lib/agents/agent-config";
import { getListingKindSpec, type ListingKind } from "@/lib/marketplace/listing-kinds";
import { payloadTooLarge } from "@/lib/marketplace/payload";

/**
 * The mandatory pre-publish security check.
 *
 * FAIL-CLOSED, and there is no "flag and continue" path — the same call
 * the published-sites route makes, for a stronger version of the same
 * reason. There, a flagged site would become a live page on our origin.
 * Here it would become a live page on our origin that a STRANGER PAID
 * FOR, on the strength of our having listed it. A marketplace that
 * distributes something harmful has not merely hosted it; it has
 * recommended it and taken a commission.
 *
 * Three checks, in ascending order of what they cost to run:
 *
 *   SIZE     a payload that will not fit is refused before anything
 *            reads it.
 *   FENCE    no listing text or payload may contain the untrusted-source
 *            markers. Those delimiters are what every AI feature in this
 *            app uses to tell data from instructions; a seller who could
 *            embed a closing marker in a prompt they sell could break out
 *            of the fence on the BUYER's account, which is the one
 *            prompt-injection route a marketplace uniquely creates.
 *   HTML     the full static scan, for the one kind that carries markup.
 *
 * Returns issues in words a seller can act on, because a rejection they
 * cannot understand is a support ticket rather than a fix.
 */

export type ListingReviewResult =
  | { passed: true; checks: string[] }
  | { passed: false; checks: string[]; issues: string[] };

const FENCE_CHECK = "untrusted-source markers absent from listing text and payload";
const SIZE_CHECK = "payload within the size ceiling";
const HTML_CHECK =
  "static security scan of the generated HTML (external scripts, inline handlers, form targets, iframes, dynamic code)";

/** Every string anywhere inside a JSON value, however deeply nested. A
 *  check that only looked at the top level would miss a marker inside a
 *  slide's bullet or an agent config's nested field — which is exactly
 *  where somebody would put one. */
function allStrings(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 12) return out;
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out, depth + 1);
  else if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) allStrings(v, out, depth + 1);
  }
  return out;
}

export function containsFenceMarker(value: unknown): boolean {
  return allStrings(value).some((s) => s.includes(UNTRUSTED_OPEN) || s.includes(UNTRUSTED_CLOSE));
}

export function reviewListing(params: {
  kind: ListingKind;
  title: string;
  summary: string;
  description: string;
  payload: Record<string, unknown>;
}): ListingReviewResult {
  const spec = getListingKindSpec(params.kind);
  const checks: string[] = [];
  const issues: string[] = [];

  checks.push(SIZE_CHECK);
  if (payloadTooLarge(params.payload)) {
    issues.push("This item is too large to list. Templates are configurations, not asset libraries.");
  }

  checks.push(FENCE_CHECK);
  if (
    containsFenceMarker(params.payload) ||
    containsFenceMarker([params.title, params.summary, params.description])
  ) {
    issues.push(
      "This listing contains reserved markers that AI features use to separate data from instructions. Remove them and try again."
    );
  }

  if (spec?.carriesHtml) {
    checks.push(HTML_CHECK);
    const html = typeof params.payload.html === "string" ? params.payload.html : "";
    if (!html.trim()) {
      issues.push("There is no generated content to list.");
    } else {
      // Stripped first, then scanned, then refused on anything left —
      // the same order the publish route uses. Removing an external
      // <script src> can only ever remove something that had no place in
      // this app's generation contract; what survives the strip and
      // still trips the scan is deliberate.
      const cleaned = stripDisallowedExternalScripts(html);
      for (const issue of scanWebsiteHtmlForSecurityIssues(cleaned)) {
        issues.push(describeSecurityScanIssue(issue));
      }
    }
  }

  return issues.length === 0 ? { passed: true, checks } : { passed: false, checks, issues };
}

/**
 * The payload as it should be STORED after a passing review.
 *
 * For HTML the stored bytes are the STRIPPED ones, not the originals.
 * Storing what was submitted and serving what was scanned is how a
 * scan-then-store split lets the unscanned version reach a buyer.
 */
export function payloadForStorage(
  kind: ListingKind,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const spec = getListingKindSpec(kind);
  if (!spec?.carriesHtml) return payload;
  const html = typeof payload.html === "string" ? payload.html : "";
  return { ...payload, html: stripDisallowedExternalScripts(html) };
}
