import {
  MODEL_PRICING_USD,
  priceUsage,
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

  /**
   * Every model that was actually called, in first-seen order.
   *
   * WHY THIS EXISTS. The accumulator has always KNOWN the model — it is
   * what priceUsage() prices against — but nothing persisted it, so every
   * row in ai_cost_log answered "which model produced this cost?" with
   * silence. That is the one question you cannot answer any other way
   * after the fact, and it is exactly the question you need when a real
   * cost looks too low: was the cheap model billed for an expensive
   * model's work, or was the cheap model genuinely what ran?
   *
   * Recorded as a list rather than a single value because one settled
   * action is several sub-calls (classifier, generation, security review)
   * and they do not have to be the same model.
   */
  modelsUsed(): string[] {
    const seen: string[] = [];
    for (const e of this.entries) {
      if (e.model && !seen.includes(e.model)) seen.push(e.model);
    }
    return seen;
  }

  /**
   * USD and call count per model.
   *
   * modelsUsed() says WHICH; this says HOW MUCH each. A row showing
   * 95% of its cost against a model that was supposed to be a cheap
   * pre-check is a mis-tiering that no per-stage number would surface.
   */
  costByModel(): Record<string, { usdCost: number; calls: number }> {
    const out: Record<string, { usdCost: number; calls: number }> = {};
    for (const e of this.entries) {
      const key = e.model || "unknown";
      const row = out[key] ?? { usdCost: 0, calls: 0 };
      row.usdCost += e.usage.usdCost;
      row.calls += 1;
      out[key] = row;
    }
    for (const k of Object.keys(out)) out[k].usdCost = Number(out[k].usdCost.toFixed(8));
    return out;
  }

  /**
   * Models whose price this app does not actually know.
   *
   * A model missing from MODEL_PRICING_USD is priced with
   * FALLBACK_MODEL_PRICING — deliberately the most expensive known model,
   * so the failure direction is safe — but "safe" is not "correct", and a
   * feature quietly running on an unpriced model should be visible in the
   * cost row rather than only in a code review.
   */
  unpricedModels(): string[] {
    return this.modelsUsed().filter((m) => !(m in MODEL_PRICING_USD));
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
