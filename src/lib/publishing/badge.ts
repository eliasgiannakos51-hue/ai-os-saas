import type { PlanSlug } from "@/lib/billing/plans";
import { getPlan } from "@/lib/billing/plans";

/**
 * The "Made with Ionexa" badge on a published site (V4 #25).
 *
 * ============================================================================
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE
 * ============================================================================
 * THE BADGE IS NEVER STORED IN THE HTML. It is decided at SERVE time, from
 * the CURRENT state of the account and the site, on every single request.
 *
 * That is not a stylistic preference, it is the difference between the
 * feature working and the feature being a slow leak. published_sites
 * .html_content is a SNAPSHOT (see v3_website_hosting_migration.sql), and
 * site_versions holds twenty more snapshots that a rollback can promote
 * back to live at any time. If "has this account paid?" were baked into
 * those bytes:
 *
 *   - a user who paid in March and lapsed in April keeps a badge-free page
 *     forever, because the bytes written in March never change again;
 *   - a user who pays today and then rolls back to last week's version
 *     gets the badge back and is being charged for nothing;
 *   - every one of those is silent. No error, no log line, no way to see it
 *     except by looking at somebody's page and knowing what to look for.
 *
 * So serving does two things, in this order, unconditionally:
 *
 *   1. STRIP any badge markup found in the stored bytes. Nothing should
 *      ever put one there, and scripts/tests/badge-removal.test.mjs
 *      asserts that no write path does — but stripping first means that
 *      even if something one day did, or a customer pasted our own markup
 *      into their page, the stored copy cannot decide this question.
 *   2. INJECT one if, and only if, the state RIGHT NOW says so.
 *
 * The result is that the answer is recomputed from scratch on every
 * request and cannot be stale by construction.
 *
 * ============================================================================
 * WHAT DECIDES IT
 * ============================================================================
 *   plan grants it free  -> no badge, and the purchase route REFUSES to
 *                           charge (never double-charge someone who
 *                           already has it included in what they pay
 *                           monthly)
 *   paid_until in future -> no badge
 *   anything else        -> badge
 *
 * Plan is checked FIRST so that an account which paid for badge removal
 * and then upgraded is never charged twice for the same thing; the renewal
 * job reads the same function and stops re-charging them.
 */

// ---------------------------------------------------------------------
// Price.
// ---------------------------------------------------------------------
//
// HOW THIS NUMBER WAS DERIVED, since "pick a number" is how pricing goes
// wrong quietly.
//
// The repo's normal pricing formula is
//   credits = ceil(realCostEur * marginMultiplier / creditPriceEur)
// and for badge removal realCostEur is 0.00 — no model is called, no token
// is spent, the only marginal cost is the handful of bytes appended to a
// response that was already being sent. Run literally, the formula returns
// 0 credits and the >=4x margin guarantee is satisfied infinitely. So the
// margin rule is a FLOOR here, not a price: it tells us nothing can make
// this unprofitable, and nothing about what to charge.
//
// The honest anchor is SUBSTITUTION VALUE — what the customer is buying is
// the badge-free page that a Starter subscription would also give them:
//
//   200 credits x EUR 0.02 (Free/list rate)            = EUR 4.00 / month / site
//   ... against the EUR 20/month Starter upgrade it replaces = 20% of it
//   ... and 20% of a Starter's 1,000-credit monthly allowance
//
// Both readings land on the same fifth, which is why 200 is the number
// rather than 150 or 250: it is priced as a fifth of the subscription it
// substitutes for, whichever side you compute it from.
//
// That fifth puts BREAK-EVEN AT EXACTLY FIVE SITES — 5 x EUR 4.00 = the
// EUR 20 Starter price — and that is the property worth having. One to
// four sites: buying is strictly cheaper than upgrading, so a customer
// with a single page is never pushed into a subscription they do not need.
// Five: a wash. Six or more: the subscription wins, which is correct,
// because someone running six published sites genuinely is a Starter
// customer. A price that never crossed the subscription line would leave
// them buying badges forever and never upgrading.
//
// Env-overridable because it is a price, and a price that needs a deploy
// to change is a price nobody ever changes.
export const DEFAULT_BADGE_REMOVAL_CREDITS_PER_MONTH = 200;

/** A purchased period. 30 days, not "a calendar month": a fixed length is
 *  the only one that is the same deal in February as in July. */
export const BADGE_REMOVAL_PERIOD_DAYS = 30;

/** How far ahead of expiry the warning email goes out. */
export const BADGE_EXPIRY_WARNING_DAYS = 7;

const MAX_SANE_PRICE = 100_000;

export function badgeRemovalCreditsPerMonth(
  env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env
): number {
  const raw = env.BADGE_REMOVAL_CREDITS_PER_MONTH;
  if (raw === undefined || raw.trim() === "") return DEFAULT_BADGE_REMOVAL_CREDITS_PER_MONTH;
  const parsed = Number(raw);
  // A malformed price falls back to the default rather than to 0. Charging
  // nothing because someone typed "200 " with a stray character is the one
  // failure mode a pricing constant must not have.
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_SANE_PRICE) {
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn(
        `[badge] BADGE_REMOVAL_CREDITS_PER_MONTH="${raw}" ignored (not a whole number in 0-${MAX_SANE_PRICE}) — using ${DEFAULT_BADGE_REMOVAL_CREDITS_PER_MONTH}.`
      );
    }
    return DEFAULT_BADGE_REMOVAL_CREDITS_PER_MONTH;
  }
  return parsed;
}

// ---------------------------------------------------------------------
// The rule.
// ---------------------------------------------------------------------

export type BadgeReason =
  /** The plan includes a badge-free site. Nothing to buy, nothing to charge. */
  | "included_in_plan"
  /** Bought with credits, still inside the paid period. */
  | "paid"
  /** Bought once, the period ran out — the badge is back. */
  | "lapsed"
  /** Never bought. */
  | "never_purchased";

export type BadgeState = {
  showBadge: boolean;
  reason: BadgeReason;
  /** null when never purchased. Past when lapsed. */
  paidUntil: Date | null;
  /** Whole days until the paid period ends; null unless currently paid. */
  daysRemaining: number | null;
  /** True when the plan already covers it — the purchase route's refusal. */
  includedInPlan: boolean;
};

const DAY_MS = 86_400_000;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  // An unparseable timestamp fails CLOSED — badge shown. The alternative
  // (treat garbage as "paid") gives away the product for free on bad data.
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Whether a plan includes badge removal at no extra charge.
 *
 * Reads the SAME PlanCapabilities the rest of the app gates on, rather than
 * a list of slugs kept in this file, so moving the boundary is one edit in
 * plans.ts and it moves everywhere — the serve path, the purchase refusal,
 * the renewal skip and the dashboard label all at once.
 */
export function planIncludesBadgeRemoval(slug: PlanSlug | null | undefined): boolean {
  if (!slug) return false;
  return getPlan(slug)?.capabilities.freeBadgeRemoval === true;
}

export function resolveBadgeState(input: {
  planSlug: PlanSlug | null | undefined;
  paidUntil: string | Date | null | undefined;
  now: Date;
}): BadgeState {
  const paidUntil = toDate(input.paidUntil);

  // Plan first, deliberately. Someone on Starter+ must never be told they
  // could buy something they already have, and must never be charged for
  // it even if an old paid period is still sitting in the column.
  if (planIncludesBadgeRemoval(input.planSlug)) {
    return {
      showBadge: false,
      reason: "included_in_plan",
      paidUntil,
      daysRemaining: null,
      includedInPlan: true,
    };
  }

  if (!paidUntil) {
    return {
      showBadge: true,
      reason: "never_purchased",
      paidUntil: null,
      daysRemaining: null,
      includedInPlan: false,
    };
  }

  const remainingMs = paidUntil.getTime() - input.now.getTime();
  if (remainingMs <= 0) {
    return { showBadge: true, reason: "lapsed", paidUntil, daysRemaining: null, includedInPlan: false };
  }

  return {
    showBadge: false,
    reason: "paid",
    paidUntil,
    // Ceil, not floor: with 30 minutes left the honest answer to "how many
    // days do I have" is 1, not 0.
    daysRemaining: Math.ceil(remainingMs / DAY_MS),
    includedInPlan: false,
  };
}

/** Where a newly bought or renewed period ends. Extends from the later of
 *  `now` and the current expiry, so renewing early never burns the days
 *  already paid for. */
export function nextBadgePaidUntil(currentPaidUntil: string | Date | null | undefined, now: Date): Date {
  const current = toDate(currentPaidUntil);
  const base = current && current.getTime() > now.getTime() ? current : now;
  return new Date(base.getTime() + BADGE_REMOVAL_PERIOD_DAYS * DAY_MS);
}

/** True when a paid period is close enough to its end to warn about, and
 *  the warning for THIS period has not gone out yet. */
export function shouldWarnAboutExpiry(input: {
  paidUntil: string | Date | null | undefined;
  notifiedAt: string | Date | null | undefined;
  now: Date;
}): boolean {
  const paidUntil = toDate(input.paidUntil);
  if (!paidUntil) return false;

  const remainingMs = paidUntil.getTime() - input.now.getTime();
  if (remainingMs <= 0) return false; // already gone; nothing to warn about
  if (remainingMs > BADGE_EXPIRY_WARNING_DAYS * DAY_MS) return false;

  // A notice is spent when it was sent DURING the current period. A
  // renewal pushes paid_until forward, which automatically makes the old
  // notice predate the new period's window and re-arms the warning — no
  // reset column, nothing to remember to clear.
  const notifiedAt = toDate(input.notifiedAt);
  if (!notifiedAt) return true;
  return notifiedAt.getTime() < paidUntil.getTime() - BADGE_REMOVAL_PERIOD_DAYS * DAY_MS;
}

// ---------------------------------------------------------------------
// The markup.
// ---------------------------------------------------------------------
//
// Constraints it has to satisfy, all of them non-negotiable:
//
//   * It renders under the published-site CSP (public-serving.ts), which
//     is `default-src 'self'` with no external hosts. So: no <img src>, no
//     webfont, no stylesheet, no script. An inline `style` attribute and an
//     inline SVG are the entire budget, and both are allowed
//     ('unsafe-inline' in style-src covers the attribute).
//   * It cannot break the customer's layout. position:fixed takes it out
//     of flow entirely, so nothing on the page reflows because of it.
//   * It must be findable and removable by exact string, which is what
//     BADGE_MARKER is for — a data attribute rather than a class, because a
//     class could plausibly collide with generated CSS.
//   * It carries rel="noopener" and a real href. The link is the point:
//     this is the free tier paying for itself in referrals.

/** The one string that identifies our badge in a document. */
export const BADGE_MARKER = "data-ionexa-badge";

export const BADGE_TEXT = "Made with Ionexa";

const BADGE_LOGO_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false" ' +
  'style="display:block;flex:none">' +
  '<path d="M12 2 3 12l9 10 9-10z" fill="#f97316"></path>' +
  "</svg>";

/**
 * Builds the badge element. `siteUrl` is the marketing site to link at —
 * passed in rather than read from the environment here so this module stays
 * importable from the browser bundle (the dashboard shows a preview of it).
 */
export function badgeHtml(siteUrl: string): string {
  const href = `${siteUrl.replace(/\/+$/, "")}/?ref=badge`;
  return (
    `<a ${BADGE_MARKER}="1" href="${escapeAttribute(href)}" target="_blank" rel="noopener nofollow" ` +
    `aria-label="${BADGE_TEXT}" ` +
    'style="position:fixed;right:14px;bottom:14px;z-index:2147483000;' +
    "display:inline-flex;align-items:center;gap:6px;" +
    "padding:7px 11px;border-radius:9999px;" +
    "background:#0b0b0bec;color:#fafafa;" +
    "border:1px solid #ffffff26;" +
    "font:500 12px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;" +
    "letter-spacing:.01em;text-decoration:none;" +
    'box-shadow:0 2px 10px #00000040">' +
    BADGE_LOGO_SVG +
    `<span style="display:block">${BADGE_TEXT}</span>` +
    "</a>"
  );
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Removes every badge element from a document, whatever it looks like.
 *
 * Matched on the marker attribute rather than on the exact markup, so a
 * badge injected by an older deploy (different padding, different copy)
 * is still removed by a newer one. Without that, a styling change would
 * silently leave two badges stacked on pages served from a warm cache.
 */
export function stripBadge(html: string): string {
  if (!html.includes(BADGE_MARKER)) return html;
  // Non-greedy up to the first </a>: the badge contains no nested anchor
  // (anchors cannot nest in HTML at all), so the first close is ours.
  return html.replace(new RegExp(`<a\\b[^>]*${BADGE_MARKER}[^>]*>[\\s\\S]*?<\\/a>`, "gi"), "");
}

/**
 * Puts the badge into a document, immediately before </body>.
 *
 * Falls back to appending when there is no </body> — a generated fragment,
 * or a document whose closing tag the model omitted. Appending after the
 * last byte still renders (browsers close an unterminated body), and a
 * badge that renders is the correct outcome; skipping it because the
 * markup was untidy would be revenue quietly not collected.
 */
export function injectBadge(html: string, siteUrl: string): string {
  const badge = badgeHtml(siteUrl);
  const match = /<\/body\s*>/i.exec(html);
  if (!match) return html + badge;
  return html.slice(0, match.index) + badge + html.slice(match.index);
}

/**
 * The whole serve-time decision in one call: strip whatever the stored
 * bytes claim, then re-add the badge if the CURRENT state says to.
 *
 * Every public request goes through this. It is pure — the caller supplies
 * the state — so it is testable without a database and cannot accidentally
 * read something cached.
 */
export function applyBadgeToServedHtml(input: {
  html: string;
  planSlug: PlanSlug | null | undefined;
  paidUntil: string | Date | null | undefined;
  now: Date;
  siteUrl: string;
}): { html: string; state: BadgeState } {
  const state = resolveBadgeState({
    planSlug: input.planSlug,
    paidUntil: input.paidUntil,
    now: input.now,
  });
  // Strip unconditionally, including when the badge is about to go back
  // in: that is what makes a stored badge unable to produce a DOUBLE one.
  const stripped = stripBadge(input.html);
  return { html: state.showBadge ? injectBadge(stripped, input.siteUrl) : stripped, state };
}
