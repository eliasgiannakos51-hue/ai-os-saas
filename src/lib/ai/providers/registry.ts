import {
  AI_PROVIDERS,
  isAiProvider,
  type AiCapability,
  type AiProvider,
  type AiPurpose,
} from "@/lib/ai/providers/types";
import { UNVERIFIED_PRICE_PROVIDERS, providerSupports } from "@/lib/ai/providers/catalog";

/**
 * WHICH PROVIDERS EXIST HERE, IN WHAT ORDER, FOR WHAT.
 *
 * FROM CONFIG, NOT HARDCODED — the brief's (β), and the reason the whole
 * module takes an `env` argument rather than reading process.env at the
 * top: a routing decision that cannot be exercised by a test with a
 * made-up environment is a routing decision nobody will ever check.
 *
 * A MISSING KEY DISABLES A PROVIDER CLEANLY. Not a throw, not a 500, not
 * a call that fails at the socket — the provider is simply not in the
 * chain, and `disabled` says why in a sentence. This is the
 * `new Resend(undefined)` lesson, which cost this project a whole
 * debugging session: an SDK that throws from its own constructor makes
 * "no key" and "the network is down" the same stack trace. Every key
 * here is read BY NAME, before any client is constructed.
 *
 * ANTHROPIC IS NOT SPECIAL IN THE CODE, only in the defaults. It leads
 * every default chain because it is the provider whose prices this app
 * has actually been billing against, and because it is the only one in
 * the catalog offering server-side web search. Nothing prevents an
 * operator putting it last.
 */

export type ProviderStatus = {
  provider: AiProvider;
  enabled: boolean;
  /** Present when disabled. A sentence for an operator reading a log,
   *  never for a user. */
  disabledReason?: string;
  /** True when catalog.ts's prices for this provider have not been
   *  confirmed against a real bill. */
  pricesUnverified: boolean;
};

export type ProviderEnv = Record<string, string | undefined>;

/** The env var carrying each provider's key. Read by name, first, always. */
export const PROVIDER_KEY_ENV_VARS: Record<AiProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
  groq: "GROQ_API_KEY",
};

/** The global chain, and the per-purpose override that beats it. */
export const PROVIDER_ORDER_ENV_VAR = "AI_PROVIDER_ORDER";
export function purposeOrderEnvVar(purpose: AiPurpose): string {
  return `${PROVIDER_ORDER_ENV_VAR}_${purpose.toUpperCase()}`;
}

export const FAILOVER_ENV_VAR = "AI_FAILOVER_ENABLED";

/**
 * The default chain when nothing is configured: Anthropic alone.
 *
 * DELIBERATELY NOT "everything that has a key". A deployment that adds
 * OPENAI_API_KEY for the voice transcription in lib/voice/voice-providers.ts
 * has said nothing whatever about wanting its chat answered by GPT — and
 * silently rerouting every model call in the product because an unrelated
 * feature needed a key from the same vendor is the kind of surprise that
 * ends in a support thread about "why does it sound different today".
 * Adding a provider to the chain is an explicit act.
 */
export const DEFAULT_PROVIDER_ORDER: readonly AiProvider[] = ["anthropic"];

export type ProviderKeyWarning = { envVar: string; value: string; reason: string };

/**
 * Parses a chain like "anthropic,groq" into providers, keeping the bad
 * entries as warnings rather than throwing them away.
 *
 * A TYPO MUST NOT SILENTLY EMPTY THE CHAIN. `AI_PROVIDER_ORDER=anthropc`
 * would otherwise leave no providers at all and take every AI feature in
 * the product down at once, with the cause sitting in an env var nobody
 * is looking at. Unknown names are dropped WITH A WARNING and the rest of
 * the chain still stands; a chain that parses to nothing falls back to
 * the default rather than to nothing.
 */
export function parseProviderOrder(
  raw: string | undefined,
  envVar: string
): { order: AiProvider[]; warnings: ProviderKeyWarning[] } {
  const warnings: ProviderKeyWarning[] = [];
  if (raw === undefined || raw.trim() === "") return { order: [], warnings };

  const seen = new Set<AiProvider>();
  const order: AiProvider[] = [];
  for (const piece of raw.split(",")) {
    const name = piece.trim().toLowerCase();
    if (!name) continue;
    if (!isAiProvider(name)) {
      warnings.push({
        envVar,
        value: name,
        reason: `not a known provider (expected one of ${AI_PROVIDERS.join(", ")})`,
      });
      continue;
    }
    // A repeated provider is not an error and not a second attempt: the
    // chain is "try these in turn", and trying the same one twice in a
    // row after it just failed is a retry the failover layer already
    // owns.
    if (seen.has(name)) continue;
    seen.add(name);
    order.push(name);
  }
  return { order, warnings };
}

function hasKey(env: ProviderEnv, provider: AiProvider): boolean {
  const value = env[PROVIDER_KEY_ENV_VARS[provider]];
  return typeof value === "string" && value.trim().length > 0;
}

/** Every provider and whether it could serve a call at all right now. */
export function providerStatuses(env: ProviderEnv): ProviderStatus[] {
  return AI_PROVIDERS.map((provider) => {
    const pricesUnverified = UNVERIFIED_PRICE_PROVIDERS.includes(provider);
    if (!hasKey(env, provider)) {
      return {
        provider,
        enabled: false,
        disabledReason: `${PROVIDER_KEY_ENV_VARS[provider]} is not set`,
        pricesUnverified,
      };
    }
    return { provider, enabled: true, pricesUnverified };
  });
}

export type ResolvedChain = {
  purpose: AiPurpose;
  /** In the order they will be tried. */
  order: AiProvider[];
  /** Configured but not usable, each with its reason. Kept so the log can
   *  say "we did not try openai because OPENAI_API_KEY is not set" rather
   *  than leaving a silent gap in the chain. */
  skipped: { provider: AiProvider; reason: string }[];
  warnings: ProviderKeyWarning[];
  /** Which env var decided this, so an operator can find it. */
  source: string;
  failoverEnabled: boolean;
};

/**
 * The chain for one purpose, with the capabilities it must have applied.
 *
 * CAPABILITY FILTERING HAPPENS HERE, BEFORE ANY CALL. A research run
 * needs server-side web search and only Anthropic offers it in this
 * catalog; putting Groq in the chain for that purpose is not an error to
 * discover at request time, it is a provider to leave out with a reason
 * attached.
 */
export function resolveChain(params: {
  env: ProviderEnv;
  purpose: AiPurpose;
  requires?: readonly AiCapability[];
}): ResolvedChain {
  const { env, purpose } = params;
  const requires = params.requires ?? [];

  const purposeVar = purposeOrderEnvVar(purpose);
  const perPurpose = parseProviderOrder(env[purposeVar], purposeVar);
  const global = parseProviderOrder(env[PROVIDER_ORDER_ENV_VAR], PROVIDER_ORDER_ENV_VAR);

  let configured: AiProvider[];
  let source: string;
  if (perPurpose.order.length > 0) {
    configured = perPurpose.order;
    source = purposeVar;
  } else if (global.order.length > 0) {
    configured = global.order;
    source = PROVIDER_ORDER_ENV_VAR;
  } else {
    configured = [...DEFAULT_PROVIDER_ORDER];
    source = "default";
  }

  const statuses = new Map(providerStatuses(env).map((s) => [s.provider, s]));
  const order: AiProvider[] = [];
  const skipped: { provider: AiProvider; reason: string }[] = [];
  for (const provider of configured) {
    const status = statuses.get(provider);
    if (!status?.enabled) {
      skipped.push({ provider, reason: status?.disabledReason ?? "unavailable" });
      continue;
    }
    const missing = requires.filter((c) => !providerSupports(provider, c));
    if (missing.length > 0) {
      skipped.push({ provider, reason: `does not offer ${missing.join(", ")}` });
      continue;
    }
    order.push(provider);
  }

  // Failover is ON unless explicitly turned off. The safe default for a
  // reliability feature is the one that keeps working when a provider
  // has an incident, and an operator who wants deterministic single-
  // provider behaviour can say so.
  const failoverEnabled = String(env[FAILOVER_ENV_VAR] ?? "").trim().toLowerCase() !== "false";

  return {
    purpose,
    order,
    skipped,
    warnings: [...perPurpose.warnings, ...global.warnings],
    source,
    failoverEnabled,
  };
}

// Warned once per process per provider. An unverified price table is a
// standing condition, not an event, and a line per request would bury
// the one that matters.
const warnedUnverified = new Set<string>();

/**
 * Says, once, that a provider is serving traffic on prices nobody has
 * checked against a bill.
 *
 * This is not decoration. Every credit charge in this product is
 * `ceil(real_cost x margin / credit_price)`, and "real_cost" for a
 * non-Anthropic provider comes entirely from the table in catalog.ts,
 * which was written without an account to verify it against.
 */
export function warnIfPricesUnverified(env: ProviderEnv): string[] {
  const warned: string[] = [];
  for (const status of providerStatuses(env)) {
    if (!status.enabled || !status.pricesUnverified) continue;
    warned.push(status.provider);
    if (warnedUnverified.has(status.provider)) continue;
    warnedUnverified.add(status.provider);
    // eslint-disable-next-line no-console
    console.error(
      `[ai-providers] ${status.provider} is enabled, and its prices in ` +
        `src/lib/ai/providers/catalog.ts have NOT been confirmed against a real bill. ` +
        `Every credit charge for a call it serves is computed from those numbers. ` +
        `Check them before serving real traffic.`
    );
  }
  return warned;
}
