import type { PlanSlug } from "@/lib/billing/plans";
import { getPlan } from "@/lib/billing/plans";
import { DEFAULT_PRESENTATION_LIMITS } from "@/lib/presentations/presentation-limits";
import { DEFAULT_RESEARCH_LIMITS } from "@/lib/files/limits";
import { DEFAULT_PUBLISH_LIMITS } from "@/lib/publishing/publish-limits";

/**
 * Which sidebar destinations are locked on a plan, and what unlocks them.
 *
 * A hidden locked feature does not exist. Free users never learn the
 * product HAS agents or Deep Research, which means the thing that would
 * have made them upgrade is invisible at exactly the moment it could
 * persuade. So locked features stay in the sidebar, marked with a lock
 * and the plan that opens them, and clicking one lands on the feature's
 * own page — which already explains itself and shows the upgrade path.
 *
 * DERIVED FROM THE REAL ENFORCEMENT, never listed by hand. Each entry
 * reads the same capability flag or default limit the server actually
 * checks, so the lock in the sidebar and the 403 behind it cannot
 * disagree. A hand-maintained list here would drift the first time a
 * plan changed — showing a lock on something that works, or worse, no
 * lock on something that refuses.
 */

export type FeatureLock = {
  href: string;
  /** The first plan (in rank order) on which the feature works. */
  unlockedOn: string;
};

const PLAN_ORDER: PlanSlug[] = ["free", "starter", "growth", "professional", "ultimate", "enterprise"];

function firstPlanWhere(test: (slug: PlanSlug) => boolean): string | null {
  for (const slug of PLAN_ORDER) {
    if (test(slug)) return getPlan(slug)?.name ?? slug;
  }
  return null;
}

/** The locked destinations for one plan. Empty for any paid tier today,
 *  but computed rather than special-cased, so a future plan that trims a
 *  capability gets its locks without anyone remembering this file. */
export function lockedFeaturesForPlan(planSlug: string | null | undefined): FeatureLock[] {
  const slug = (PLAN_ORDER as string[]).includes(planSlug ?? "") ? (planSlug as PlanSlug) : "free";
  const locks: FeatureLock[] = [];

  const checks: { href: string; unlocked: (s: PlanSlug) => boolean }[] = [
    {
      href: "/dashboard/agents",
      unlocked: (s) => {
        const max = getPlan(s)?.capabilities.maxAiAgents ?? 0;
        return max === "unlimited" || max > 0;
      },
    },
    { href: "/dashboard/website-builder", unlocked: (s) => Boolean(getPlan(s)?.capabilities.websiteBuilder) },
    { href: "/dashboard/presentations", unlocked: (s) => DEFAULT_PRESENTATION_LIMITS[s] > 0 },
    { href: "/dashboard/deep-research", unlocked: (s) => DEFAULT_RESEARCH_LIMITS[s] > 0 },
    { href: "/dashboard/published", unlocked: (s) => DEFAULT_PUBLISH_LIMITS[s] > 0 },
  ];

  for (const check of checks) {
    if (check.unlocked(slug)) continue;
    const unlockedOn = firstPlanWhere(check.unlocked);
    // A feature no plan unlocks is not "locked", it is absent — and a
    // lock pointing at no plan is a dead end nobody should be shown.
    if (unlockedOn) locks.push({ href: check.href, unlockedOn });
  }

  return locks;
}
