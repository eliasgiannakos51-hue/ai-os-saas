import type { PlanSlug } from "@/lib/billing/plans";

// Fair use for published sites, per plan, env-overridable.
//
// Same shape and same reasoning as lib/agents/agent-limits.ts: a published
// site is ongoing cost (bandwidth, storage, a request path we serve for
// free forever) rather than a one-off action, so the ceiling has to be
// adjustable without a deploy. Free is zero — hosting anonymous strangers'
// pages on our domain, indefinitely, at no charge, is a spam and phishing
// surface long before it is a cost problem.
//
// Enterprise is "unlimited" here in a way agents deliberately are not: a
// static page costs bandwidth, not per-request Anthropic money, and the
// number is negotiated per deal.

export const UNLIMITED = Number.POSITIVE_INFINITY;

export const DEFAULT_PUBLISH_LIMITS: Record<PlanSlug, number> = {
  free: 0,
  starter: 1,
  growth: 3,
  professional: 10,
  ultimate: 30,
  enterprise: UNLIMITED,
};

export const PUBLISH_LIMIT_ENV_VARS: Record<PlanSlug, string> = {
  free: "PUBLISHED_SITE_LIMIT_FREE",
  starter: "PUBLISHED_SITE_LIMIT_STARTER",
  growth: "PUBLISHED_SITE_LIMIT_GROWTH",
  professional: "PUBLISHED_SITE_LIMIT_PROFESSIONAL",
  ultimate: "PUBLISHED_SITE_LIMIT_ULTIMATE",
  enterprise: "PUBLISHED_SITE_LIMIT_ENTERPRISE",
};

const MAX_SANE_LIMIT = 10000;

export type PublishLimitWarning = { variable: string; value: string; reason: string };

export function parsePublishLimits(env: Record<string, string | undefined>): {
  limits: Record<PlanSlug, number>;
  warnings: PublishLimitWarning[];
} {
  const warnings: PublishLimitWarning[] = [];
  const limits = { ...DEFAULT_PUBLISH_LIMITS };

  for (const slug of Object.keys(DEFAULT_PUBLISH_LIMITS) as PlanSlug[]) {
    const variable = PUBLISH_LIMIT_ENV_VARS[slug];
    const raw = env[variable];
    if (raw === undefined || raw.trim() === "") continue;

    // "unlimited" spelled out, because Infinity is not something you can
    // type into a hosting dashboard's environment editor.
    if (raw.trim().toLowerCase() === "unlimited") {
      limits[slug] = UNLIMITED;
      continue;
    }

    const parsed = Number(raw);
    if (!Number.isInteger(parsed)) {
      warnings.push({ variable, value: raw, reason: 'not a whole number (or "unlimited")' });
      continue;
    }
    if (parsed < 0 || parsed > MAX_SANE_LIMIT) {
      warnings.push({ variable, value: raw, reason: `outside the allowed range 0-${MAX_SANE_LIMIT}` });
      continue;
    }
    limits[slug] = parsed;
  }

  return { limits, warnings };
}

let cached: Record<PlanSlug, number> | null = null;

export function resolvePublishLimits(): Record<PlanSlug, number> {
  if (cached) return cached;
  const { limits, warnings } = parsePublishLimits(typeof process === "undefined" ? {} : process.env);
  for (const w of warnings) {
    // eslint-disable-next-line no-console
    console.warn(`[publish-limits] ${w.variable}="${w.value}" ignored (${w.reason}) — using default.`);
  }
  cached = limits;
  return limits;
}

export function maxPublishedSitesForPlan(slug: PlanSlug | null | undefined): number {
  if (!slug) return DEFAULT_PUBLISH_LIMITS.free;
  const limits = resolvePublishLimits();
  return limits[slug] ?? DEFAULT_PUBLISH_LIMITS.free;
}

/**
 * How many live edits one site may take per day.
 *
 * Each one runs the AI Output Protection Layer and rewrites what the
 * public sees; unbounded, it is both a cost and a way to flap a live page.
 */
export const MAX_LIVE_EDITS_PER_SITE_PER_DAY = 20;

/**
 * Versions kept per site. Older ones are pruned on publish, so a site that
 * is edited daily for a year does not accumulate a year of full HTML
 * copies in a table every dashboard query touches.
 */
export const MAX_SITE_VERSIONS = 20;
