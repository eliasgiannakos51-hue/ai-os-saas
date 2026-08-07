import { tierForModel } from "@/lib/ai/models";

// What an AI action tells the client it cost.
//
// Deliberately NOT `server-only`: the server builds it from a settlement,
// the client renders it, and one shared shape is what stops the two
// drifting. Every AI route returns this under `usage`.
//
// It exists because settlement was invisible. The credits counter only
// moved on a full page reload, and nothing anywhere told the user what an
// action had just cost — the numbers were correct in the database and
// nowhere else. A charge the user cannot see is indistinguishable, from
// their side, from a charge that did not happen.

export type UsageReceipt = {
  /** Credits actually deducted. 0 for a bypass or a free message. */
  creditsCharged: number;
  /** True when the account is not billed at all (admin, beta, free chat). */
  bypass: boolean;
  /** For a bypass: what a normal account on this plan would have paid.
   *  "Unlimited" on its own tells an owner nothing about whether pricing
   *  is working; this is the number that does. */
  wouldHaveCharged: number | null;
  /** Free-chat allowance left this month, when this was a free message. */
  freeRemaining: number | null;
  /** "max" when the action ran (at least partly) on the strongest model
   *  tier (V3, lib/ai/models.ts). The user never picks a model — this is
   *  the discreet "· advanced model" note on the receipt that explains
   *  why a complex brief cost more than yesterday's simple one, which
   *  otherwise looks like a pricing bug from their side. Null means
   *  nothing worth noting. */
  modelTier: "max" | null;
};

/** Server-side: build the receipt from a settlement result. */
export function buildUsageReceipt(params: {
  creditsCharged: number;
  bypass: boolean;
  wouldHaveCharged?: number | null;
  freeRemaining?: number | null;
  /** Models the settlement actually recorded (CostAccumulator entries) —
   *  the receipt derives the tier note from what RAN, never from what was
   *  requested. */
  modelsUsed?: readonly string[];
}): UsageReceipt {
  return {
    creditsCharged: Math.max(0, Math.round(params.creditsCharged || 0)),
    bypass: Boolean(params.bypass),
    wouldHaveCharged:
      typeof params.wouldHaveCharged === "number" && Number.isFinite(params.wouldHaveCharged)
        ? Math.max(0, Math.round(params.wouldHaveCharged))
        : null,
    freeRemaining:
      typeof params.freeRemaining === "number" && Number.isFinite(params.freeRemaining)
        ? Math.max(0, Math.round(params.freeRemaining))
        : null,
    modelTier: (params.modelsUsed ?? []).some((m) => tierForModel(m) === "max") ? "max" : null,
  };
}

/**
 * Client-side: pull a receipt out of an arbitrary API response.
 *
 * Tolerant on purpose. Routes return wildly different shapes (JSON, an
 * NDJSON event, a polled status row), and a receipt that throws would turn
 * a successful action into a failed one. An unparseable payload just means
 * no toast.
 */
export function readUsageReceipt(payload: unknown): UsageReceipt | null {
  if (!payload || typeof payload !== "object") return null;
  const usage = (payload as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  if (typeof u.creditsCharged !== "number" || !Number.isFinite(u.creditsCharged)) return null;
  return {
    creditsCharged: Math.max(0, Math.round(u.creditsCharged)),
    bypass: u.bypass === true,
    wouldHaveCharged: typeof u.wouldHaveCharged === "number" ? Math.max(0, Math.round(u.wouldHaveCharged)) : null,
    freeRemaining: typeof u.freeRemaining === "number" ? Math.max(0, Math.round(u.freeRemaining)) : null,
    modelTier: u.modelTier === "max" ? "max" : null,
  };
}
