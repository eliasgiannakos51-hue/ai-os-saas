// The personalised upgrade suggestion, after 30 days (V3 Task 9).
//
// This is the third and last way the product ever asks for money, and
// the slowest. lib/upgrade-triggers.ts speaks at MOMENTS — a success
// that used the last of an allowance, a second refusal. This one speaks
// about a PATTERN: a month of actual usage that shows the plan is
// genuinely tight. The two are deliberately separate rules, because a
// moment is evidence about right now and a pattern is evidence about
// the account, and collapsing them produces a banner that fires on
// day two because somebody had a busy afternoon.
//
// The conditions, all required:
//
//   THIRTY DAYS OLD. Before that there is no pattern, only enthusiasm.
//   A heavy first week is what onboarding is FOR; suggesting a bigger
//   plan because somebody explored the product punishes exploring it.
//
//   A REAL CEILING, NEARLY REACHED. Some metered allowance was at least
//   SUGGEST_AT (80%) used this calendar month. Not "activity was high"
//   — a specific number against the specific cap their plan sets, which
//   is what makes the suggestion personal rather than a campaign. The
//   caps come from the SAME limit modules the servers enforce with, so
//   the banner can never cite an allowance the API would not apply.
//
//   SOMEWHERE TO GO. A next self-serve plan exists (nextPlanUp), and its
//   cap for the binding resource is actually HIGHER. A suggestion that
//   names a plan which does not fix the stated problem is a lie with
//   numbers in it.
//
// Anything less returns "none", and the card renders nothing. The
// cooldown (30 days, browser-side, same reasoning as the other two) is
// on top of all of this.

import { nextPlanUp } from "@/lib/billing/plans";
import type { PlanSlug } from "@/lib/billing/plans";
import { maxPresentationsForPlan } from "@/lib/presentations/presentation-limits";
import { maxResearchRunsForPlan } from "@/lib/files/limits";
import { maxPublishedSitesForPlan } from "@/lib/publishing/publish-limits";

export const SUGGESTION_MIN_ACCOUNT_AGE_DAYS = 30;
/** Fraction of a monthly cap that counts as "nearly reached". */
export const SUGGEST_AT = 0.8;
export const SUGGESTION_COOLDOWN_DAYS = 30;
export const SUGGESTION_STORAGE_KEY = "ionexa_upgrade_suggestion_at";

/** i18n keys under upgradeSuggestion.resources.<key> */
export type MeteredResource = "presentations" | "researchReports" | "publishedSites";

export type UsageThisMonth = Record<MeteredResource, number>;

export type UpgradeSuggestion =
  | { kind: "none" }
  | {
      kind: "suggest";
      resource: MeteredResource;
      used: number;
      cap: number;
      nextPlan: string;
      nextCap: number;
    };

/** The caps the suggestion compares against — resolved through the same
 *  per-plan (and env-overridable) functions the enforcing routes call. */
function capsForPlan(slug: string): Record<MeteredResource, number> {
  const plan = slug as PlanSlug;
  return {
    presentations: maxPresentationsForPlan(plan),
    researchReports: maxResearchRunsForPlan(plan),
    publishedSites: maxPublishedSitesForPlan(plan),
  };
}

export function buildUpgradeSuggestion(params: {
  accountAgeDays: number | null;
  planSlug: string;
  usedThisMonth: UsageThisMonth;
}): UpgradeSuggestion {
  // No pattern before thirty days — see the header. Unknown age fails
  // closed for the same reason the onboarding guide does.
  if (params.accountAgeDays === null || params.accountAgeDays < SUGGESTION_MIN_ACCOUNT_AGE_DAYS) {
    return { kind: "none" };
  }

  const next = nextPlanUp(params.planSlug);
  if (!next) return { kind: "none" };

  const caps = capsForPlan(params.planSlug);
  const nextCaps = capsForPlan(next.slug);

  // Find the single most-binding resource: highest utilisation of a
  // finite, non-zero cap. Zero caps are skipped — a Free account's
  // presentations cap of 0 is a lock, and locks are the upgrade wall's
  // and the sidebar's story, not this banner's. Infinite caps cannot
  // bind by definition.
  let best: UpgradeSuggestion & { kind: "suggest" } | null = null;
  let bestUtilisation = 0;
  for (const resource of Object.keys(caps) as MeteredResource[]) {
    const cap = caps[resource];
    if (!Number.isFinite(cap) || cap <= 0) continue;
    const used = params.usedThisMonth[resource] ?? 0;
    const utilisation = used / cap;
    if (utilisation < SUGGEST_AT) continue;
    // The named plan must actually fix the named problem.
    const nextCap = nextCaps[resource];
    if (!(nextCap > cap)) continue;
    if (utilisation > bestUtilisation) {
      bestUtilisation = utilisation;
      best = {
        kind: "suggest",
        resource,
        // Reported used is clamped to the cap: a count above it (admin
        // bypass, a cap lowered mid-month) would render "7 of 5", which
        // reads as a bug even when it is history.
        used: Math.min(used, cap),
        cap,
        nextPlan: next.name,
        nextCap,
      };
    }
  }

  return best ?? { kind: "none" };
}
