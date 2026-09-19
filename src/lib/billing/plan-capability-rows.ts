/**
 * ONE LIST PER PLAN CARD, DERIVED FROM THE PLANS.
 *
 * THE REPORT, 2026-09-19: "every plan shows THE SAME list of 7 features…
 * Free says it has Team collaboration. IT DOES NOT. And underneath there
 * is a SECOND list with the correct ones."
 *
 * All three halves were real, and none of them was on /pricing — that
 * page was measured against production at 390px in Greek and English and
 * each card shows only its own features. It was the SIGNUP plan chooser,
 * which carried its own `CAPABILITY_ROWS`: seven rows, written in the
 * component, as English string literals, above a second list of the
 * plan's real features.
 *
 *   THE SAME SEVEN UNDER EVERY PLAN — true, and by design: a ✓/✕ list
 *   has to show the same rows or the plans cannot be compared. What made
 *   it read as a lie is that the ✕ was `text-muted/50` on an 11px line
 *   with a 12px icon. The person who built the product read seven ticks.
 *   A customer would too.
 *
 *   FREE SAYS IT HAS TEAM COLLABORATION — the DATA was right
 *   (`capabilities.teamCollaboration` is false for free); the ✕ saying
 *   so was invisible. docs/shapes.md: when the defect is visual, measure
 *   the screen.
 *
 *   TWO LISTS — the second repeated part of the first in different words
 *   ("Website & Automation Builder" above, "Website & Automation Builder
 *   access" below).
 *
 * WHY THIS FILE. The seven rows were a list written beside the code that
 * rendered them, which is the shape docs/shapes.md calls *the rule
 * targets the shape, the check anchors on the example*: the rule is
 * "show what separates the plans", and seven hand-picked rows are one
 * day's answer to it. A row added to the catalog never reached the
 * signup page; a capability removed from a plan left a row behind.
 *
 * So the rows are DERIVED: every entry in the feature catalog whose cell
 * is a tick for at least one plan and a cross for at least one. That set
 * is exactly "what separates the plans", it cannot go stale, and its
 * labels are already translated at `pricing.rows.<id>` in all ten
 * locales — which the seven literals were not, in nine of them, on the
 * page a non-English visitor meets when they create an account.
 */
import { soldFeatures, type CellWords, type FeatureCell, type FeatureEntry } from "./feature-catalog";
import { PLANS, type Plan } from "./plans";

export type CapabilityRow = { id: string; cell: FeatureCell };

/**
 * Catalog entries that are a tick for some plan and a cross for another.
 *
 * A row that is a tick everywhere does not help anybody choose, and a
 * row that is a cross everywhere is not sold. Both are excluded, which
 * is why this is smaller than the comparison table on /pricing and says
 * nothing that table does not.
 */
export function distinguishingFeatures(
  words: CellWords,
  locale = "en",
  plans: readonly Plan[] = PLANS
): FeatureEntry[] {
  return soldFeatures().filter((entry) => {
    let ticks = 0;
    let crosses = 0;
    for (const plan of plans) {
      const kind = entry.cell(plan, locale, words).type;
      if (kind === "check") ticks += 1;
      else if (kind === "cross") crosses += 1;
    }
    return ticks > 0 && crosses > 0;
  });
}

/**
 * The rows one plan card shows, in catalog order.
 *
 * `lead` entries come first whatever the catalog order — the number of
 * agents is what a buyer compares before anything else, and it is a
 * VALUE row rather than a tick, so it would otherwise be dropped by the
 * filter above.
 */
export function capabilityRowsFor(
  plan: Plan,
  words: CellWords,
  locale = "en",
  lead: readonly string[] = ["aiAgents"]
): CapabilityRow[] {
  const catalog = soldFeatures();
  const leading = lead
    .map((id) => catalog.find((e) => e.id === id))
    .filter((e): e is FeatureEntry => Boolean(e));
  const rest = distinguishingFeatures(words, locale).filter((e) => !lead.includes(e.id));
  return [...leading, ...rest].map((entry) => ({
    id: entry.id,
    cell: entry.cell(plan, locale, words),
  }));
}
