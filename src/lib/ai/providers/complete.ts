import "server-only";
import { catalogModel, substituteModel, type CatalogModel } from "@/lib/ai/providers/catalog";
import { cacheImpactOfRoute, cachedPrefixTokens } from "@/lib/ai/providers/cache-policy";
import { ATTEMPT_TIMEOUT_MS, classifyError } from "@/lib/ai/providers/failover";
import { resolveChain, warnIfPricesUnverified, PROVIDER_KEY_ENV_VARS } from "@/lib/ai/providers/registry";
import { callAnthropic } from "@/lib/ai/providers/adapters/anthropic";
import { callOpenAi } from "@/lib/ai/providers/adapters/openai";
import { callGoogle } from "@/lib/ai/providers/adapters/google";
import { callGroq } from "@/lib/ai/providers/adapters/groq";
import type { Adapter } from "@/lib/ai/providers/adapters/shared";
import { recordProviderAttempts } from "@/lib/ai/providers/provider-log";
import type { AiAttempt, AiOutcome, AiProvider, AiRequest } from "@/lib/ai/providers/types";

/**
 * THE ONE CALL. Everything above this line is a rule; this is where a
 * request actually goes somewhere.
 *
 * WHAT THE USER SEES OF ALL THIS: nothing. That is the brief's (ε) and it
 * is enforced by what this function returns — text, tokens and a model
 * id, in one shape, whoever served it. No provider name reaches a
 * component, no error body reaches a toast. A caller that wants to know
 * can read `attempts`; nothing in the UI does.
 *
 * WHAT AN OPERATOR SEES: every attempt, in order, with the outcome, the
 * status, the latency, WHY that provider was tried, and whether the
 * prompt cache survived being routed there. That last column is the one
 * that would otherwise be invisible — a failover succeeds, the answer is
 * right, and the only trace is a bill that went up.
 *
 * ONE ATTEMPT PER PROVIDER, NOT PER MODEL. A provider that just returned
 * a 500 is not more likely to answer on its second-choice model, and a
 * retry loop inside a chain turns one slow incident into four.
 */

const ADAPTERS: Record<AiProvider, Adapter> = {
  anthropic: callAnthropic,
  openai: callOpenAi,
  google: callGoogle,
  groq: callGroq,
};

export type CompleteOptions = {
  /** Defaults to process.env. Injectable so the routing rules can be
   *  exercised by a test with a made-up environment. */
  env?: Record<string, string | undefined>;
  /** For the log only. Never sent to any provider. */
  userId?: string;
  /** Per-attempt budget. See failover.ts for why it is per attempt. */
  timeoutMs?: number;
  /** THE STOP BUTTON — V4.6. The caller's request signal: when the person
   *  aborts, the attempt in flight is aborted with it and NO failover is
   *  tried — a stop is not a provider failure to route around. The
   *  outcome is `kind: "aborted"` so the route can release the hold. */
  signal?: AbortSignal;
};

export async function runCompletion(
  request: AiRequest,
  options: CompleteOptions = {}
): Promise<AiOutcome> {
  const env = options.env ?? process.env;
  const timeoutMs = options.timeoutMs ?? ATTEMPT_TIMEOUT_MS;
  const requires = request.requires ?? [];

  warnIfPricesUnverified(env);

  const chain = resolveChain({ env, purpose: request.purpose, requires });
  const attempts: AiAttempt[] = [];

  if (chain.order.length === 0) {
    // TWO DIFFERENT FAILURES WEARING THE SAME FACE, and they need
    // different fixes: "nothing is configured" is an env problem, "the
    // configured providers cannot do this" is a routing problem. The
    // skipped list already carries the reason for each.
    const capabilityBlocked =
      requires.length > 0 && chain.skipped.some((s) => s.reason.startsWith("does not offer"));
    return {
      ok: false,
      kind: capabilityBlocked ? "unsupported" : "no_provider",
      detail:
        `purpose=${request.purpose} source=${chain.source} ` +
        `skipped=[${chain.skipped.map((s) => `${s.provider}: ${s.reason}`).join("; ")}] ` +
        `warnings=[${chain.warnings.map((w) => `${w.envVar}=${w.value} (${w.reason})`).join("; ")}]`,
      attempts,
    };
  }

  // Failover off means the chain is one long. Truncating here rather than
  // branching below keeps ONE loop: two code paths for "with failover"
  // and "without" is two places for the logging to diverge.
  const order = chain.failoverEnabled ? chain.order : chain.order.slice(0, 1);

  const originModel = catalogModel(request.model);
  const originTier: CatalogModel["tier"] = originModel?.tier ?? "mid";
  const prefixTokens = cachedPrefixTokens(request.system);

  let lastFailure: { kind: "bad_request" | "all_failed"; detail: string } | null = null;

  for (let i = 0; i < order.length; i += 1) {
    const provider = order[i];
    const previous = attempts[attempts.length - 1];
    const reason =
      i === 0
        ? `primary for ${request.purpose} (from ${chain.source})`
        : `failover after ${previous?.provider}/${previous?.outcome}`;

    // The caller's model when this provider serves it, otherwise the
    // cheapest model here that is at least as capable. Null means this
    // provider has nothing adequate — skipped, with the reason recorded,
    // rather than served by something weaker without saying so.
    const model =
      originModel && originModel.provider === provider
        ? originModel
        : substituteModel(provider, originTier, requires);
    if (!model) {
      attempts.push({
        provider,
        model: "",
        outcome: "unsupported",
        status: null,
        latencyMs: 0,
        reason: `${reason} — no model at ${originTier} tier or above offering ${requires.join(", ") || "the basics"}`,
        cacheKept: null,
      });
      continue;
    }

    const impact = cacheImpactOfRoute({
      fromModel: originModel?.id,
      toModel: model.id,
      cachedPrefixTokens: prefixTokens,
    });

    const apiKey = env[PROVIDER_KEY_ENV_VARS[provider]];
    if (!apiKey) {
      // resolveChain already checked this; re-checked because between the
      // two the only thing standing between a missing key and a vendor
      // SDK constructor is this line, and that constructor throws.
      attempts.push({
        provider,
        model: model.id,
        outcome: "auth_error",
        status: null,
        latencyMs: 0,
        reason: `${reason} — ${PROVIDER_KEY_ENV_VARS[provider]} disappeared between resolve and call`,
        cacheKept: impact.keptCache,
      });
      continue;
    }

    if (options.signal?.aborted) {
      void recordProviderAttempts({ userId: options.userId, purpose: request.purpose, attempts });
      return { ok: false, kind: "aborted", detail: "stopped by the caller before the attempt", attempts };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onCallerAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onCallerAbort);
    const startedAt = Date.now();
    try {
      const response = await ADAPTERS[provider]({
        apiKey,
        model: model.id,
        request,
        signal: controller.signal,
      });
      attempts.push({
        provider,
        model: model.id,
        outcome: "success",
        status: 200,
        latencyMs: Date.now() - startedAt,
        reason: impact.keptCache === false && impact.lostTokens > 0 ? `${reason}; ${impact.reason}` : reason,
        cacheKept: impact.keptCache,
      });
      void recordProviderAttempts({ userId: options.userId, purpose: request.purpose, attempts });
      return {
        ok: true,
        provider,
        model: model.id,
        reportedModel: response.reportedModel,
        text: response.text,
        toolCalls: response.toolCalls,
        usage: response.usage,
        stopReason: response.stopReason,
        attempts,
      };
    } catch (err) {
      if (options.signal?.aborted) {
        // The person stopped it. Not a timeout, not a vendor fault, and
        // not something to try on the next provider.
        attempts.push({
          provider,
          model: model.id,
          outcome: "timeout",
          status: null,
          latencyMs: Date.now() - startedAt,
          reason: `${reason}; stopped by the caller`,
          cacheKept: impact.keptCache,
        });
        void recordProviderAttempts({ userId: options.userId, purpose: request.purpose, attempts });
        return { ok: false, kind: "aborted", detail: "stopped by the caller", attempts };
      }
      const classified = classifyError(err);
      attempts.push({
        provider,
        model: model.id,
        outcome: classified.outcome,
        status: classified.status,
        latencyMs: Date.now() - startedAt,
        reason,
        cacheKept: impact.keptCache,
      });
      if (!classified.failover) {
        // OUR BUG, NOT THE VENDOR'S. Stop, and say so, instead of paying
        // three providers to reject the same malformed request.
        lastFailure = { kind: "bad_request", detail: `${provider}/${classified.outcome} status=${classified.status}` };
        break;
      }
      lastFailure = { kind: "all_failed", detail: `${provider}/${classified.outcome} status=${classified.status}` };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onCallerAbort);
    }
  }

  void recordProviderAttempts({ userId: options.userId, purpose: request.purpose, attempts });
  return {
    ok: false,
    kind: lastFailure?.kind ?? "all_failed",
    detail: lastFailure?.detail ?? "no attempt was made",
    attempts,
  };
}
