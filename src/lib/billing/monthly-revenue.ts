import { ANNUAL_MONTHS_CHARGED, getPlan, TEAM_SEAT_PRICE, type Plan } from "@/lib/billing/plans";

/**
 * MONTHLY RECURRING REVENUE — the denominator the 2% alert needs.
 *
 * WHERE THE PARTS COME FROM, and why they come from two places.
 *
 *   WHO subscribes to WHAT is in auth.users.raw_user_meta_data, read by
 *   the mrr_inputs() aggregate (see the 20260823 migration for why that
 *   is a function and not a table or a view).
 *
 *   WHAT A PLAN COSTS is in lib/billing/plans.ts, where
 *   resolvePricingConfig can override it. Putting prices in SQL too would
 *   create exactly the two-sources-of-truth problem the migration went
 *   out of its way to avoid, one level down.
 *
 * COMPLETENESS IS PART OF THE ANSWER. Enterprise is priced "custom": its
 * revenue is real and this function cannot know it. Returning a number
 * that silently omits it would UNDERSTATE revenue, which INFLATES every
 * share computed against it — and the first thing that share is used for
 * is deciding whether absorbed refusals have crossed 2%. An understated
 * denominator turns that into a false alarm about a business assumption,
 * which is the worst possible thing for it to be wrong about.
 *
 * So the figure carries whether it is complete, and the alert refuses to
 * fire when it is not. Silence with a stated reason beats a confident
 * wrong number.
 */

export type MrrInputRow = {
  tier: string;
  billingInterval: string;
  subscribers: number;
  seats: number;
};

export type MonthlyRevenue = {
  /** Monthly recurring revenue in EUR from the tiers that have a price. */
  eur: number;
  /** False when at least one subscriber is on a tier with no listed
   *  price — today that is only "enterprise". */
  complete: boolean;
  /** How many subscribers could not be priced, so the gap is visible
   *  rather than merely flagged. */
  unpricedSubscribers: number;
  /** Which tiers those were. */
  unpricedTiers: string[];
};

/**
 * ANNUAL IS NOT A TWELFTH OF THE ANNUAL PRICE OF A MONTHLY PLAN.
 *
 * An annual subscription is charged ANNUAL_MONTHS_CHARGED months for
 * twelve months of service (lib/billing/plans.ts). Spreading that over
 * the year gives the real monthly revenue from that customer, which is
 * LOWER than the monthly plan's price — treating it as equal would
 * overstate MRR by the discount, on exactly the customers who pay up
 * front.
 */
function monthlyEurForRow(plan: Plan, row: MrrInputRow): number {
  if (typeof plan.price !== "number") return 0;
  const perMonth =
    row.billingInterval === "year" ? (plan.price * ANNUAL_MONTHS_CHARGED) / 12 : plan.price;

  // SEATS, and only where the plan actually sells them. seat_count is
  // written for every account (see the Stripe webhook), so a plan without
  // team seats would otherwise be multiplied by a number that means
  // nothing on it.
  if (!plan.hasTeamSeats) return perMonth * row.subscribers;

  // The subscription covers the account itself; each seat beyond the
  // first is TEAM_SEAT_PRICE on top.
  const extraSeats = Math.max(row.seats - row.subscribers, 0);
  return perMonth * row.subscribers + extraSeats * TEAM_SEAT_PRICE;
}

export function monthlyRecurringRevenue(rows: MrrInputRow[]): MonthlyRevenue {
  let eur = 0;
  let unpricedSubscribers = 0;
  const unpricedTiers = new Set<string>();

  for (const row of rows) {
    const plan = getPlan(row.tier);
    // FREE IS NOT UNPRICED. Its price is zero and that is a known fact,
    // not a gap — counting free users as "could not price" would make
    // every deployment permanently incomplete and silence the alert
    // forever.
    if (!plan) {
      // A tier this app does not know about. It might be a legacy slug or
      // a typo in metadata; either way its revenue is unknown.
      unpricedSubscribers += row.subscribers;
      unpricedTiers.add(row.tier);
      continue;
    }
    if (typeof plan.price !== "number") {
      unpricedSubscribers += row.subscribers;
      unpricedTiers.add(row.tier);
      continue;
    }
    eur += monthlyEurForRow(plan, row);
  }

  return {
    eur: Math.round(eur * 100) / 100,
    complete: unpricedSubscribers === 0,
    unpricedSubscribers,
    unpricedTiers: [...unpricedTiers].sort(),
  };
}
