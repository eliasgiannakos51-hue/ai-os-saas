import { priceUsage, type AnthropicUsageLike, type UsageBreakdown } from "@/lib/billing/model-pricing";

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

  /**
   * Records one Anthropic response. Safe to call with a null/undefined
   * usage (a failed or aborted call) — it contributes zero rather than
   * throwing, so error paths can record unconditionally.
   */
  record(stage: CostStage, usage: AnthropicUsageLike | null | undefined, model: string): void {
    this.entries.push({ stage, model, usage: priceUsage(usage, model) });
  }

  /**
   * Merges a breakdown produced elsewhere (e.g. a helper that already
   * priced its own call) without re-pricing it.
   */
  addBreakdown(stage: CostStage, model: string, usage: UsageBreakdown): void {
    this.entries.push({ stage, model, usage });
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
