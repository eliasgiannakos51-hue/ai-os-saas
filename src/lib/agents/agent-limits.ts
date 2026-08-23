import { PLANS, type PlanSlug } from "@/lib/billing/plans";

// Fair use for Autonomous Agents, per plan, every number overridable from
// the environment.
//
// Why env-overridable rather than a constant: an agent is the one thing in
// this product that costs money while nobody is looking at it. If a plan's
// allowance turns out to be too generous, that has to be fixable on the
// hosting dashboard in a minute, not in a deploy. Same reasoning as
// lib/billing/pricing-config.ts, and the same parsing discipline — an
// unparseable or out-of-range value falls back to the default and warns,
// rather than being silently clamped into something that looks deliberate.
//
// Free is ZERO on purpose. An agent runs forever without further consent;
// giving unauthenticated-cost-forever to accounts that pay nothing is how
// a free tier becomes an outbound spam and Anthropic-bill amplifier.

// Derived from PLANS rather than written out a second time.
//
// The pricing page renders plan.capabilities.maxAiAgents and this file
// enforces it. Two hand-maintained copies of the same six numbers is a
// promise on a public page drifting away from what the server actually
// allows — the exact failure mode that produced "Unlimited AI Agents" on a
// plan whose real ceiling was a tracker row count.
//
// free 0 · starter 2 · growth 5 · professional 15 · ultimate 50 ·
// enterprise 100, as of this migration. Change them in plans.ts, where the
// user can see them.
export const DEFAULT_AGENT_LIMITS: Record<PlanSlug, number> = PLANS.reduce(
  (acc, plan) => {
    acc[plan.slug] =
      // No published plan is "unlimited" any more, and this feature must
      // never treat one as such: an unbounded number of scheduled agents
      // is an unbounded recurring bill. A hypothetical future
      // "unlimited" tier is capped here at the highest real allowance.
      plan.capabilities.maxAiAgents === "unlimited" ? 100 : plan.capabilities.maxAiAgents;
    return acc;
  },
  {} as Record<PlanSlug, number>
);

export const AGENT_LIMIT_ENV_VARS: Record<PlanSlug, string> = {
  free: "AGENT_LIMIT_FREE",
  starter: "AGENT_LIMIT_STARTER",
  growth: "AGENT_LIMIT_GROWTH",
  professional: "AGENT_LIMIT_PROFESSIONAL",
  ultimate: "AGENT_LIMIT_ULTIMATE",
  enterprise: "AGENT_LIMIT_ENTERPRISE",
};

// A cap this large is certainly a typo (a stray zero on 100), and the
// damage from honouring it is unbounded — so it is rejected, not clamped.
const MAX_SANE_AGENT_LIMIT = 1000;

export type LimitWarning = { variable: string; value: string; reason: string };

/**
 * Pure resolver — takes the environment as an argument so the rules can be
 * unit tested without touching process.env, exactly like parsePricingConfig.
 */
export function parseAgentLimits(env: Record<string, string | undefined>): {
  limits: Record<PlanSlug, number>;
  warnings: LimitWarning[];
} {
  const warnings: LimitWarning[] = [];
  const limits = { ...DEFAULT_AGENT_LIMITS };

  for (const slug of Object.keys(DEFAULT_AGENT_LIMITS) as PlanSlug[]) {
    const variable = AGENT_LIMIT_ENV_VARS[slug];
    const raw = env[variable];
    if (raw === undefined || raw.trim() === "") continue;

    const parsed = Number(raw);
    if (!Number.isInteger(parsed)) {
      warnings.push({ variable, value: raw, reason: "not a whole number" });
      continue;
    }
    if (parsed < 0 || parsed > MAX_SANE_AGENT_LIMIT) {
      warnings.push({
        variable,
        value: raw,
        reason: `outside the allowed range 0-${MAX_SANE_AGENT_LIMIT}`,
      });
      continue;
    }
    limits[slug] = parsed;
  }

  return { limits, warnings };
}

let cached: Record<PlanSlug, number> | null = null;

export function resolveAgentLimits(): Record<PlanSlug, number> {
  if (cached) return cached;
  const { limits, warnings } = parseAgentLimits(
    typeof process === "undefined" ? {} : process.env
  );
  for (const w of warnings) {
    // eslint-disable-next-line no-console
    console.warn(`[agent-limits] ${w.variable}="${w.value}" ignored (${w.reason}) — using default.`);
  }
  cached = limits;
  return limits;
}

export function maxAgentsForPlan(slug: PlanSlug | null | undefined): number {
  if (!slug) return DEFAULT_AGENT_LIMITS.free;
  const limits = resolveAgentLimits();
  return limits[slug] ?? DEFAULT_AGENT_LIMITS.free;
}

/**
 * THE CAP AN ACCOUNT ACTUALLY HAS — plan plus whatever it bought.
 *
 * V4 #25 sells "+5 agents, EUR10/month". Every cap check in the app read
 * maxAgentsForPlan, which knows nothing about add-ons — so the day that
 * add-on shipped, a customer who paid for it would have hit the plan's
 * ceiling and been told to upgrade. The failure is silent, at the point
 * of use, and looks exactly like the plan working correctly.
 *
 * So the five call sites read THIS instead, and
 * scripts/tests/revenue-engine.test.mjs asserts that none of them has
 * gone back to reading the plan alone.
 *
 * It is async because the add-ons are a row; maxAgentsForPlan stays for
 * the places that genuinely mean "what does this PLAN include" — the
 * pricing page and the upgrade prompt, which are talking about the plan
 * rather than about this account.
 */
export async function maxAgentsForAccount(
  userId: string,
  slug: PlanSlug | null | undefined
): Promise<number> {
  const planCap = maxAgentsForPlan(slug);
  try {
    const { loadAddons } = await import("@/lib/billing/addon-store");
    const { resolveEntitlements } = await import("@/lib/billing/addons");
    const entitlements = resolveEntitlements({ plan: null, addons: await loadAddons(userId) });
    // Only the ADD-ON contribution is taken from the resolver: the plan's
    // own cap comes from maxAgentsForPlan above, which honours the
    // AGENT_LIMIT_* environment overrides that plans.ts does not know
    // about. Reading the plan through both would apply one of them twice.
    return planCap + entitlements.fromAddons.agents;
  } catch {
    // FAILS TO THE PLAN. An unreadable add-on table gives the customer
    // what they had before they bought anything — wrong, visible to them,
    // and recoverable. The other direction hands out agents nobody paid
    // for, forever, silently.
    return planCap;
  }
}

// ---------------------------------------------------------------------
// Execution rate limit — the second half of fair use.
// ---------------------------------------------------------------------
//
// The agent COUNT caps how many schedules exist. This caps how many
// executions any one user can cause in an hour, whatever the source
// (schedule, "Run now", a retry). It is what stops a user with 50 agents
// on Ultimate plus a fast finger on "Run now" from turning one account
// into a sustained Anthropic load.
export const DEFAULT_AGENT_RUNS_PER_HOUR = 20;

export function maxAgentRunsPerHour(env: Record<string, string | undefined> = process.env): number {
  const raw = env.AGENT_MAX_RUNS_PER_HOUR;
  if (raw === undefined || raw.trim() === "") return DEFAULT_AGENT_RUNS_PER_HOUR;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
    // eslint-disable-next-line no-console
    console.warn(
      `[agent-limits] AGENT_MAX_RUNS_PER_HOUR="${raw}" ignored (must be a whole number 1-500) — using default.`
    );
    return DEFAULT_AGENT_RUNS_PER_HOUR;
  }
  return parsed;
}

// ---------------------------------------------------------------------
// Failure handling.
// ---------------------------------------------------------------------

/** Attempts per scheduled execution: the first try plus two retries. */
export const AGENT_MAX_ATTEMPTS = 3;

/** Consecutive failed executions before the agent switches itself off. */
export const AGENT_MAX_CONSECUTIVE_FAILURES = 5;
