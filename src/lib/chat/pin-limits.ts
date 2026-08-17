import type { PlanSlug } from "@/lib/billing/plans";

/**
 * How many conversations an account may keep pinned, per plan.
 *
 * WHY THERE IS A LIMIT AT ALL, since pinning costs nothing to run: the
 * pinned group sits above every other conversation in the sidebar, and a
 * list where everything is pinned is a list where nothing is. The cap is
 * a usability floor, not a cost control — which is why the numbers are
 * generous and rise with the plan rather than gating the feature.
 *
 * That also decides how it FAILS. Running out of agents is a billing
 * event; running out of pins is not, so hitting this must read as "unpin
 * one first", never as "upgrade to continue". The route returns the cap
 * and the current count so the client can say exactly that.
 *
 * ENV-OVERRIDABLE, like lib/agents/agent-limits.ts and
 * lib/billing/pricing-config.ts, and parsed with the same discipline: an
 * unparseable or out-of-range value falls back to the default and warns
 * rather than being silently clamped into something that looks
 * deliberate. Same shape on purpose — a third way of reading a limit out
 * of the environment is a third place for it to be read wrongly.
 */
export const DEFAULT_PIN_LIMITS: Record<PlanSlug, number> = {
  free: 3,
  starter: 10,
  growth: 25,
  professional: 50,
  ultimate: 100,
  // Enterprise is a contract, and the sidebar argument above still
  // applies to it — so it gets the highest real number rather than
  // "unlimited". Nothing here is unbounded.
  enterprise: 100,
};

export const PIN_LIMIT_ENV_VARS: Record<PlanSlug, string> = {
  free: "PIN_LIMIT_FREE",
  starter: "PIN_LIMIT_STARTER",
  growth: "PIN_LIMIT_GROWTH",
  professional: "PIN_LIMIT_PROFESSIONAL",
  ultimate: "PIN_LIMIT_ULTIMATE",
  enterprise: "PIN_LIMIT_ENTERPRISE",
};

/**
 * Zero is allowed — turning pinning off for a tier is a legitimate
 * choice. A cap above this is certainly a typo, and honouring it would
 * defeat the only reason the limit exists, so it is rejected rather than
 * clamped: a rejected value is visible in the log, a clamped one is not.
 */
const MAX_SANE_PIN_LIMIT = 1000;

export type PinLimitWarning = { variable: string; value: string; reason: string };

/**
 * Pure resolver — takes the environment as an argument so the rules can
 * be unit tested without touching process.env.
 */
export function parsePinLimits(env: Record<string, string | undefined>): {
  limits: Record<PlanSlug, number>;
  warnings: PinLimitWarning[];
} {
  const warnings: PinLimitWarning[] = [];
  const limits = { ...DEFAULT_PIN_LIMITS };

  for (const slug of Object.keys(DEFAULT_PIN_LIMITS) as PlanSlug[]) {
    const variable = PIN_LIMIT_ENV_VARS[slug];
    const raw = env[variable];
    if (raw === undefined || raw.trim() === "") continue;

    const parsed = Number(raw);
    if (!Number.isInteger(parsed)) {
      warnings.push({ variable, value: raw, reason: "not a whole number" });
      continue;
    }
    if (parsed < 0 || parsed > MAX_SANE_PIN_LIMIT) {
      warnings.push({ variable, value: raw, reason: `outside 0-${MAX_SANE_PIN_LIMIT}` });
      continue;
    }
    limits[slug] = parsed;
  }

  return { limits, warnings };
}

/** The cap for one plan, from the live environment. */
export function pinLimitFor(planSlug: PlanSlug): number {
  return parsePinLimits(process.env).limits[planSlug];
}
