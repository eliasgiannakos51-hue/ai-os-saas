import type { ClassifyInput } from "@/lib/ai/routing/classify";
import { classifyRequest, type Category } from "@/lib/ai/routing/categorize";
import { loadModelTable, rowFor } from "@/lib/ai/routing/model-table";
import type { Tier } from "@/lib/ai/routing/tiers";

/**
 * THE ROUTER IN THE SHADOW (QUEUE E.2).
 *
 * What the 2.13 router WOULD send this request to, computed and recorded
 * next to what actually served it — and nothing else. No request changes
 * model because of this file.
 *
 * WHY A SHADOW FIRST. The brief's order is "measurement first, so there
 * is a before", and its rule is "never cheaper at the expense of
 * quality". Until the quality set (2.13 Γ, QUEUE E.4) has measured that a
 * cheaper model passes for a category, moving real traffic to it would
 * break the second to satisfy the first. So every settled action carries
 * this decision in ai_cost_log.metadata.routing, and the admin page
 * (/dashboard/costs) shows the distribution — category, tier, confidence,
 * and what the same tokens would have cost on the shadow model.
 *
 * Metadata, not columns: no migration, for the reason the cost log's
 * other per-row facts live there (CostAccumulator.byModel's comment).
 */

/**
 * Settlement features that are not a text model's work — speech in and
 * out (src/lib/voice/) is priced per minute and per character by providers
 * the router does not choose between. No shadow decision for them: a
 * "category" for a transcription would be a number about nothing.
 */
export const NON_TEXT_FEATURES: ReadonlySet<string> = new Set(["voice"]);

export type ShadowDecision = {
  category: Category;
  tier: Tier;
  confidence: number;
  categoryRule: string;
  tierRule: string;
  bumped: boolean;
  /** The table's primary for this category × tier. */
  model: string;
  fallback: string | null;
  tableVersion: string;
  tableSource: "env" | "default";
};

export function shadowRoute(
  input: ClassifyInput,
  env: Record<string, string | undefined> = process.env,
): ShadowDecision {
  const c = classifyRequest(input);
  const loaded = loadModelTable(env);
  const row = rowFor(loaded.table, c.category, c.tier);
  return {
    category: c.category,
    tier: c.tier,
    confidence: c.confidence,
    categoryRule: c.categoryRule,
    tierRule: c.tierRule,
    bumped: c.bumped,
    model: row.primary,
    fallback: row.fallback,
    tableVersion: loaded.table.version,
    tableSource: loaded.source,
  };
}

/** shadowRoute that cannot throw — for call sites inside a request,
 *  where a measurement must never be the reason an answer fails. */
export function shadowRouteSafe(input: ClassifyInput): ShadowDecision | undefined {
  try {
    return shadowRoute(input);
  } catch {
    return undefined;
  }
}
