import type { PlanSlug } from "@/lib/billing/plans";

// Fair use for integrations, per plan, env-overridable — the same shape as
// lib/agents/agent-limits.ts and lib/publishing/publish-limits.ts.
//
// Free is ZERO, and unlike the other two the reason is not cost. An
// integration is a standing grant to read somebody's mail. Handing that
// capability to accounts that have never been billed, never confirmed a
// payment method, and can be created in bulk is how a product becomes the
// convenient front-end for someone else's credential harvesting. A paid
// account is not proof of good intent, but it is a name, a card, and a
// trail.

export const UNLIMITED = Number.POSITIVE_INFINITY;

export const DEFAULT_INTEGRATION_LIMITS: Record<PlanSlug, number> = {
  free: 0,
  starter: 2,
  growth: 5,
  professional: UNLIMITED,
  ultimate: UNLIMITED,
  enterprise: UNLIMITED,
};

export const INTEGRATION_LIMIT_ENV_VARS: Record<PlanSlug, string> = {
  free: "INTEGRATION_LIMIT_FREE",
  starter: "INTEGRATION_LIMIT_STARTER",
  growth: "INTEGRATION_LIMIT_GROWTH",
  professional: "INTEGRATION_LIMIT_PROFESSIONAL",
  ultimate: "INTEGRATION_LIMIT_ULTIMATE",
  enterprise: "INTEGRATION_LIMIT_ENTERPRISE",
};

const MAX_SANE_LIMIT = 100;

export type IntegrationLimitWarning = { variable: string; value: string; reason: string };

export function parseIntegrationLimits(env: Record<string, string | undefined>): {
  limits: Record<PlanSlug, number>;
  warnings: IntegrationLimitWarning[];
} {
  const warnings: IntegrationLimitWarning[] = [];
  const limits = { ...DEFAULT_INTEGRATION_LIMITS };

  for (const slug of Object.keys(DEFAULT_INTEGRATION_LIMITS) as PlanSlug[]) {
    const variable = INTEGRATION_LIMIT_ENV_VARS[slug];
    const raw = env[variable];
    if (raw === undefined || raw.trim() === "") continue;

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

export function resolveIntegrationLimits(): Record<PlanSlug, number> {
  if (cached) return cached;
  const { limits, warnings } = parseIntegrationLimits(
    typeof process === "undefined" ? {} : process.env
  );
  for (const w of warnings) {
    // eslint-disable-next-line no-console
    console.warn(`[integration-limits] ${w.variable}="${w.value}" ignored (${w.reason}) — using default.`);
  }
  cached = limits;
  return limits;
}

export function maxIntegrationsForPlan(slug: PlanSlug | null | undefined): number {
  if (!slug) return DEFAULT_INTEGRATION_LIMITS.free;
  return resolveIntegrationLimits()[slug] ?? DEFAULT_INTEGRATION_LIMITS.free;
}

/**
 * Reads of third-party data one account may cause per hour, from any
 * source (a chat question, an agent run, a manual sync).
 *
 * This is a rate limit on OUR side of somebody else's API. Exceeding
 * Google's quota does not just fail our request — it degrades the
 * integration for every user on the same OAuth client, so one account
 * cannot be allowed to spend the shared budget.
 */
export const DEFAULT_INTEGRATION_READS_PER_HOUR = 60;

export function maxIntegrationReadsPerHour(
  env: Record<string, string | undefined> = process.env
): number {
  const raw = env.INTEGRATION_MAX_READS_PER_HOUR;
  if (raw === undefined || raw.trim() === "") return DEFAULT_INTEGRATION_READS_PER_HOUR;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
    // eslint-disable-next-line no-console
    console.warn(
      `[integration-limits] INTEGRATION_MAX_READS_PER_HOUR="${raw}" ignored (must be a whole number 1-1000) — using default.`
    );
    return DEFAULT_INTEGRATION_READS_PER_HOUR;
  }
  return parsed;
}
