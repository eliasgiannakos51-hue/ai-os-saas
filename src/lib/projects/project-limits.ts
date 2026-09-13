import type { PlanSlug } from "@/lib/billing/plans";

/**
 * HOW MANY PROJECTS AN ACCOUNT MAY OWN.
 *
 * THERE WAS NO LIMIT AT ALL. `api/projects` validated the NAME
 * (`checkProjectName`, which checks length) and inserted. A project is a
 * row plus a set of `entity_links` edges, so the cost of one is small —
 * which is exactly why nobody added a ceiling, and exactly why an
 * account could hold ten thousand of them and make every project picker
 * in the product unusable.
 *
 * THE SHAPE IS THE ONE THE OTHER FIVE LIMIT MODULES ALREADY HAVE, on
 * purpose: a default table, one env var per plan, a sane ceiling that is
 * REFUSED rather than clamped, and a warning that names the variable.
 * A sixth way of reading a limit out of the environment is a sixth place
 * for it to be read wrongly.
 *
 * FREE GETS ONE, and one is not zero for a reason: a project is how this
 * product groups work, and an account that cannot make a single one
 * cannot see what the feature is. Growth gets five — the number the
 * tiering asked for — and Professional up is unbounded.
 */
export const UNLIMITED_PROJECTS = Number.POSITIVE_INFINITY;

export const DEFAULT_PROJECT_LIMITS: Record<PlanSlug, number> = {
  free: 1,
  starter: 3,
  growth: 5,
  professional: UNLIMITED_PROJECTS,
  ultimate: UNLIMITED_PROJECTS,
  enterprise: UNLIMITED_PROJECTS,
};

export const PROJECT_LIMIT_ENV_VARS: Record<PlanSlug, string> = {
  free: "PROJECT_LIMIT_FREE",
  starter: "PROJECT_LIMIT_STARTER",
  growth: "PROJECT_LIMIT_GROWTH",
  professional: "PROJECT_LIMIT_PROFESSIONAL",
  ultimate: "PROJECT_LIMIT_ULTIMATE",
  enterprise: "PROJECT_LIMIT_ENTERPRISE",
};

/** A cap this large is a typo, and honouring it removes the protection
 *  the cap exists for — refused rather than clamped, exactly as
 *  MAX_SANE_AGENT_LIMIT and MAX_SANE_PUBLISH_LIMIT are. */
const MAX_SANE_PROJECT_LIMIT = 10_000;

export type ProjectLimitWarning = { variable: string; value: string; reason: string };

export function parseProjectLimits(env: Record<string, string | undefined>): {
  limits: Record<PlanSlug, number>;
  warnings: ProjectLimitWarning[];
} {
  const limits = { ...DEFAULT_PROJECT_LIMITS };
  const warnings: ProjectLimitWarning[] = [];

  for (const slug of Object.keys(DEFAULT_PROJECT_LIMITS) as PlanSlug[]) {
    const variable = PROJECT_LIMIT_ENV_VARS[slug];
    const raw = env[variable];
    if (raw === undefined || raw.trim() === "") continue;
    const trimmed = raw.trim();
    // "unlimited" is spelled, not encoded as a huge number: a deployment
    // that means unbounded should say so, and a deployment that typed
    // 999999 by accident should be told.
    if (trimmed.toLowerCase() === "unlimited") {
      limits[slug] = UNLIMITED_PROJECTS;
      continue;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0) {
      warnings.push({ variable, value: raw, reason: "not a non-negative integer" });
      continue;
    }
    if (parsed > MAX_SANE_PROJECT_LIMIT) {
      warnings.push({
        variable,
        value: raw,
        reason: `above the sane ceiling of ${MAX_SANE_PROJECT_LIMIT} — write "unlimited" if that is what you mean`,
      });
      continue;
    }
    limits[slug] = parsed;
  }
  return { limits, warnings };
}

let cachedProjectLimits: Record<PlanSlug, number> | null = null;

export function resolveProjectLimits(): Record<PlanSlug, number> {
  if (cachedProjectLimits) return cachedProjectLimits;
  const { limits, warnings } = parseProjectLimits(process.env as Record<string, string | undefined>);
  for (const w of warnings) {
    // eslint-disable-next-line no-console
    console.warn(`[project-limits] ${w.variable}="${w.value}" ignored (${w.reason}) — using default.`);
  }
  cachedProjectLimits = limits;
  return limits;
}

/** FAILS CLOSED on an unknown slug: the Free allowance, never unbounded.
 *  A corrupt `subscription_tier` must not be the most generous plan. */
export function maxProjectsForPlan(slug: PlanSlug | null | undefined): number {
  const limits = resolveProjectLimits();
  return limits[(slug ?? "free") as PlanSlug] ?? limits.free;
}
