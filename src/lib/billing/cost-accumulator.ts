import {
  priceUsage,
  isKnownModel,
  normalizeModelId,
  type AnthropicUsageLike,
  type UsageBreakdown,
} from "@/lib/billing/model-pricing";

// Collects EVERY billable sub-call that makes up one user action.
//
// This exists because a single "generate a website" click is not one API
// call. It is, at minimum:
//   - the clarifying-questions pre-check   (lib/clarification.ts)
//   - the off-topic classifier             (lib/website-builder.ts)
//   - the main generation call             (streamed, with vision blocks
//                                           for every reference image)
//   - the AI security review               (lib/website-security-review.ts)
//   - any retry of the above
// plus, for chat, any web searches the model actually ran. Charging for
// only the main call — which is what the old flat CREDIT_COSTS constants
// effectively did — means every one of the others came out of margin.
//
// Vision costs need no special handling: image blocks are counted by
// Anthropic inside `input_tokens` of the call they were sent with, so
// recording that call records its images too.

export type CostStage =
  | "clarification"
  | "classification"
  | "generation"
  | "edit"
  | "security_review"
  | "self_check"
  | "web_search"
  | "retry"
  | "other";

export type CostEntry = {
  stage: CostStage;
  model: string;
  usage: UsageBreakdown;
};

export class CostAccumulator {
  private entries: CostEntry[] = [];
  private unpriced = new Set<string>();

  /**
   * Records one Anthropic response. Safe to call with a null/undefined
   * usage (a failed or aborted call) — it contributes zero rather than
   * throwing, so error paths can record unconditionally.
   *
   * Call sites pass `response.model ?? REQUESTED_MODEL` so the tokens are
   * priced at the rates of the model that ACTUALLY served the call, not
   * the one the code asked for. When the two diverge (an upgrade, an
   * alias, a deploy that changed a constant), pricing the requested model
   * is exactly the silent under-charge the margin guarantee exists to
   * prevent.
   */
  record(stage: CostStage, usage: AnthropicUsageLike | null | undefined, model: string): void {
    if (!isKnownModel(model)) this.unpriced.add(normalizeModelId(model));
    this.entries.push({ stage, model, usage: priceUsage(usage, model) });
  }

  /**
   * Merges a breakdown produced elsewhere (e.g. a helper that already
   * priced its own call) without re-pricing it.
   */
  addBreakdown(stage: CostStage, model: string, usage: UsageBreakdown): void {
    if (!isKnownModel(model)) this.unpriced.add(normalizeModelId(model));
    this.entries.push({ stage, model, usage });
  }

  /**
   * Every recorded sub-call, as plain data.
   *
   * Exists because a chunked action does not fit in one function
   * invocation: Deep Research on a 60-second platform runs its questions
   * across several invocations and settles once at the end (see
   * lib/research/run-research.ts). The usage measured in invocation 1 has
   * to survive into invocation 4, or the settlement charges for a
   * fraction of the work that was actually done — an under-charge that no
   * alert can see, because the stored margin would be computed from the
   * same understated cost and read as healthy.
   *
   * Deep-copied: the caller persists this as jsonb, and handing out a
   * reference to the live array would let a later record() mutate what is
   * about to be written.
   */
  snapshot(): CostEntry[] {
    return this.entries.map((e) => ({ ...e, usage: { ...e.usage } }));
  }

  /**
   * Rebuilds an accumulator from a snapshot, WITHOUT re-pricing.
   *
   * Re-pricing would be wrong twice over: the rates could have changed
   * between invocations, and the stored breakdown is already the priced
   * truth of what those calls cost when they ran.
   */
  static restore(entries: CostEntry[] | null | undefined): CostAccumulator {
    const acc = new CostAccumulator();
    for (const entry of entries ?? []) {
      if (!entry || typeof entry.model !== "string" || !entry.usage) continue;
      acc.addBreakdown(entry.stage, entry.model, entry.usage);
    }
    return acc;
  }

  /**
   * Models that were priced by FALLBACK because MODEL_PRICING_USD does not
   * know them. Settlement treats a non-empty list as an incident: the
   * fallback is the most expensive KNOWN model, which is only safe while
   * the table actually contains the expensive models — an unknown id means
   * the real rate could be anything, so a person has to look.
   */
  unknownModels(): string[] {
    return [...this.unpriced];
  }

  get totalUsdCost(): number {
    return this.entries.reduce((sum, e) => sum + e.usage.usdCost, 0);
  }

  get callCount(): number {
    return this.entries.length;
  }

  /** Flat totals across every recorded sub-call, for the cost log row. */
  totals(): UsageBreakdown {
    return this.entries.reduce<UsageBreakdown>(
      (acc, e) => ({
        inputTokens: acc.inputTokens + e.usage.inputTokens,
        outputTokens: acc.outputTokens + e.usage.outputTokens,
        cacheWriteTokens: acc.cacheWriteTokens + e.usage.cacheWriteTokens,
        cacheReadTokens: acc.cacheReadTokens + e.usage.cacheReadTokens,
        webSearches: acc.webSearches + e.usage.webSearches,
        usdCost: acc.usdCost + e.usage.usdCost,
      }),
      {
        inputTokens: 0,
        outputTokens: 0,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        webSearches: 0,
        usdCost: 0,
      }
    );
  }

  /** Per-stage USD, stored as jsonb so a margin problem can be traced to
   *  the sub-call responsible rather than just "the action was expensive". */
  breakdownByStage(): Record<string, { usdCost: number; calls: number }> {
    const out: Record<string, { usdCost: number; calls: number }> = {};
    for (const e of this.entries) {
      const row = out[e.stage] ?? { usdCost: 0, calls: 0 };
      row.usdCost += e.usage.usdCost;
      row.calls += 1;
      out[e.stage] = row;
    }
    // Round only at the very end, for storage. Rounding per entry would
    // let many small sub-calls each round to zero and vanish.
    for (const k of Object.keys(out)) {
      out[k].usdCost = Number(out[k].usdCost.toFixed(8));
    }
    return out;
  }
}
