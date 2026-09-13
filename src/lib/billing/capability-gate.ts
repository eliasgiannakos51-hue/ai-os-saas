import { getPlan, type Plan, type PlanCapabilities, type PlanSlug } from "@/lib/billing/plans";

/**
 * THE ONE WAY TO ASK "MAY THIS ACCOUNT USE THIS".
 *
 * WHY THIS EXISTS, and it is not tidiness. `PlanCapabilities.websiteBuilder`
 * was declared, rendered as a tick on the pricing page and a tick on the
 * signup grid, and READ BY NOTHING THAT REFUSES. Three call sites in the
 * whole product, all of them drawing a ✓ or a ✕. A Free account could open
 * /dashboard/website-builder and generate a site, and the page said it
 * could not — which is the one shape this repository has decided is worse
 * than a missing feature: a promise the product charges nothing to break.
 *
 * It survived for a reason worth writing down. `maxPublishedSitesForPlan`
 * IS enforced and IS zero on Free, so a Free account could generate a
 * site and not publish it. The paywall existed one step later than the
 * page claimed, so anybody checking casually found a refusal and stopped.
 *
 * AND THE OTHER ONE, which is quieter. /dashboard/memory refused
 * non-Starter accounts with `planMeetsMinimum(planSlug, "starter")` — a
 * correct refusal that does not read `capabilities.aiMemory` at all. The
 * field and the gate agreed by coincidence; moving AI Memory to Growth
 * would have changed the pricing page and not the lock. A capability that
 * is enforced by a PARALLEL rule is a capability that is not enforced by
 * its own declaration.
 *
 * So every capability check goes through here, and
 * scripts/tests/plan-enforcement.test.mjs requires each field of
 * PlanCapabilities to be read by a call to this function in a file that
 * also refuses something.
 *
 * ADMIN IS THE ONLY BYPASS, and it is a parameter rather than a lookup so
 * that a caller with no email in hand cannot silently get `false` and
 * lock the owner out of his own product.
 */
export type BooleanCapability = {
  [K in keyof PlanCapabilities]: PlanCapabilities[K] extends boolean ? K : never;
}[keyof PlanCapabilities];

export function planHasCapability(
  plan: Plan | null | undefined,
  capability: BooleanCapability,
): boolean {
  return Boolean(plan?.capabilities?.[capability]);
}

/**
 * The same question from a slug, which is what a page has.
 *
 * FAILS CLOSED on an unknown slug: `getPlan` returns undefined for a
 * corrupt `subscription_tier` column and the answer is then `false`,
 * never `true`. A database value somebody could set must not be able to
 * open a gate.
 */
export function slugHasCapability(
  slug: string | null | undefined,
  capability: BooleanCapability,
): boolean {
  return planHasCapability(getPlan(String(slug ?? "")), capability);
}

/**
 * Whether this request may proceed: the capability, or admin.
 *
 * One function rather than `isAdmin || slugHasCapability(...)` at every
 * call site, because that expression is one missing `!` away from
 * refusing the owner and one missing `isAdmin` away from charging him
 * for his own product.
 */
export function accountHasCapability(
  slug: string | null | undefined,
  capability: BooleanCapability,
  isAdmin: boolean,
): boolean {
  return isAdmin || slugHasCapability(slug, capability);
}

/** The lowest plan whose `capabilities[capability]` is true, for the
 *  sentence an upgrade wall has to say. Null when no plan has it — which
 *  is a capability nobody can buy, and the gate treats that as a defect
 *  rather than as a very exclusive feature. */
export function lowestPlanWithCapability(
  capability: BooleanCapability,
  plans: Plan[],
): PlanSlug | null {
  return plans.find((p) => p.capabilities[capability])?.slug ?? null;
}
