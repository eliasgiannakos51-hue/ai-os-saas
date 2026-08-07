// Every tunable number behind credit pricing, in one place, all
// overridable from the environment so margin can be changed on the
// hosting dashboard without touching code.
//
// Deliberately NOT `server-only`: resolvePricingConfig() runs on the
// server, but the resulting plain object is passed down to client
// components (the Website Builder's live cost estimate) so the estimate
// the user sees is computed from the SAME numbers the server will settle
// with. Process env is read only inside resolvePricingConfig, which the
// client never calls.

export type PricingConfig = {
  /** Multiplier applied to real cost before converting to credits. */
  marginMultiplier: number;
  /** What one credit is sold for, in EUR. */
  creditPriceEur: number;
  /** USD -> EUR, since Anthropic bills in USD and credits are priced in EUR. */
  usdToEurRate: number;
  /** Estimates above this many credits require explicit user confirmation. */
  largeActionConfirmThreshold: number;
  /** Percent added to an estimate when reserving, to cover variance. */
  reserveBufferPercent: number;
};

// A multiplier below 4 was the explicit business floor — anything under
// it means the product can lose money on a heavy user. Above 10 is
// almost certainly a typo (a stray zero) and would produce absurd prices,
// so both ends fall back to the default rather than being clamped: a
// silent clamp to 10 would look like the setting worked.
export const MARGIN_MULTIPLIER_MIN = 4;
export const MARGIN_MULTIPLIER_MAX = 10;

// The USD -> EUR rate needs the same kind of floor, for exactly the same
// reason, and did not have one.
//
// It is the last step between a real dollar cost and the euro figure the
// multiplier is applied to, so understating it understates the cost, and
// the shortfall lands entirely in margin — invisibly, because the margin
// the code then computes and stores is measured against the SAME
// understated euros and still reports a healthy 4x.
//
// This is not hypothetical. A production settlement of three logged calls
// costing $0.27800715 charged 45 credits. The formula cannot produce that
// number at the default rate (it gives 52), and it is not reachable by
// any plan or credit-pack rate. It is reachable at USD_TO_EUR_RATE=0.80,
// which yields exactly 45 — while the real margin against $0.278 was
// 3.52x. 0.79 gives 44 and 0.81 gives 46, so the value is pinned.
//
// The band is deliberately narrow around a plausible EUR/USD. Anything
// under the floor is rejected and the default used instead, rather than
// clamped, so a misconfiguration is visible in the logs rather than
// silently "working". Over-stating the rate is the safe direction (it
// over-charges slightly), so the ceiling is looser than the floor.
export const USD_TO_EUR_RATE_MIN = 0.85;
export const USD_TO_EUR_RATE_MAX = 1.5;

// ---------------------------------------------------------------------
// Per-plan margin.
// ---------------------------------------------------------------------
//
// One multiplier for everybody was the wrong shape, and the reason is
// that a credit is not worth the same amount on every plan:
//
//     list     EUR 0.0200 per credit
//     Starter  EUR 0.0200   (20 / 1000)
//     Growth   EUR 0.0167   (50 / 3000)
//     Pro      EUR 0.0100   (100 / 10000)
//     Ultimate EUR 0.0080   (200 / 25000)
//
// The multiplier is applied to REAL COST before dividing by that price,
// so the same 4x means something different at each tier. On Free the
// credits were given away — a monthly allowance nobody paid for — so
// every cent of real cost is a loss, and 4x recovers nothing because
// there was no revenue to recover it from. On Ultimate the customer has
// already paid EUR 200 up front and a credit costs them EUR 0.008;
// charging them a 6x multiplier on top would price the plan they bought
// out of usefulness.
//
// So margin descends as commitment rises: it is the discount for paying
// more, expressed where the money actually moves.
//
// 4 remains the FLOOR everywhere, which is what keeps
// scripts/tests/billing-coverage.test.mjs's brute force meaningful — no
// plan may be configured below the guarantee the product is sold on.
export const PLAN_MARGIN_MULTIPLIERS: Record<string, number> = {
  free: 6,
  starter: 5,
  growth: 4.5,
  professional: 4,
  ultimate: 4,
  // Negotiated, and negotiated cannot mean "below the floor". Same as
  // Ultimate until a contract says otherwise.
  enterprise: 4,
};

export const PLAN_MARGIN_ENV_VARS: Record<string, string> = {
  free: "CREDIT_MARGIN_FREE",
  starter: "CREDIT_MARGIN_STARTER",
  growth: "CREDIT_MARGIN_GROWTH",
  professional: "CREDIT_MARGIN_PROFESSIONAL",
  ultimate: "CREDIT_MARGIN_ULTIMATE",
  enterprise: "CREDIT_MARGIN_ENTERPRISE",
};

export const DEFAULTS: PricingConfig = {
  marginMultiplier: 4,
  creditPriceEur: 0.02,
  usdToEurRate: 0.92,
  largeActionConfirmThreshold: 50,
  reserveBufferPercent: 10,
};

export type ConfigWarning = { variable: string; value: string; reason: string };

// Exported separately from resolvePricingConfig so the parsing rules can
// be unit tested against hand-written inputs without touching process.env.
export function parsePricingConfig(env: Record<string, string | undefined>): {
  config: PricingConfig;
  warnings: ConfigWarning[];
} {
  const warnings: ConfigWarning[] = [];

  function num(
    variable: string,
    fallback: number,
    validate: (n: number) => string | null
  ): number {
    const raw = env[variable];
    if (raw === undefined || raw.trim() === "") return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      warnings.push({ variable, value: raw, reason: "not a finite number" });
      return fallback;
    }
    const problem = validate(parsed);
    if (problem) {
      warnings.push({ variable, value: raw, reason: problem });
      return fallback;
    }
    return parsed;
  }

  return {
    config: {
      marginMultiplier: num("CREDIT_MARGIN_MULTIPLIER", DEFAULTS.marginMultiplier, (n) =>
        n < MARGIN_MULTIPLIER_MIN || n > MARGIN_MULTIPLIER_MAX
          ? `outside the allowed range ${MARGIN_MULTIPLIER_MIN}-${MARGIN_MULTIPLIER_MAX}`
          : null
      ),
      // A zero or negative credit price would divide by zero / invert the
      // formula; an implausibly high one is treated as a typo.
      creditPriceEur: num("CREDIT_PRICE_EUR", DEFAULTS.creditPriceEur, (n) =>
        n <= 0 || n > 10 ? "must be greater than 0 and at most 10" : null
      ),
      usdToEurRate: num("USD_TO_EUR_RATE", DEFAULTS.usdToEurRate, (n) =>
        n < USD_TO_EUR_RATE_MIN || n > USD_TO_EUR_RATE_MAX
          ? `outside the allowed range ${USD_TO_EUR_RATE_MIN}-${USD_TO_EUR_RATE_MAX} — a rate below the floor understates the real cost and silently eats the margin`
          : null
      ),
      largeActionConfirmThreshold: num(
        "LARGE_ACTION_CONFIRM_THRESHOLD",
        DEFAULTS.largeActionConfirmThreshold,
        (n) => (n < 1 || !Number.isInteger(n) ? "must be a whole number of at least 1" : null)
      ),
      reserveBufferPercent: num("RESERVE_BUFFER_PERCENT", DEFAULTS.reserveBufferPercent, (n) =>
        n < 0 || n > 100 ? "must be between 0 and 100" : null
      ),
    },
    warnings,
  };
}

/**
 * The multiplier for one plan.
 *
 * Falls back to the BASE multiplier (CREDIT_MARGIN_MULTIPLIER, default 4)
 * when the plan is unknown — an account with no resolvable plan is not a
 * reason to charge nothing, and 4 is the guaranteed floor.
 *
 * A per-plan override outside the allowed range warns and falls back,
 * like every other tuning variable here. The floor matters more in this
 * one: a deployment that set CREDIT_MARGIN_FREE=2 would be selling below
 * the margin the whole product is priced on, and silently.
 */
export function marginMultiplierForPlan(
  planSlug: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): number {
  const base = parsePricingConfig(env).config.marginMultiplier;
  if (!planSlug || !(planSlug in PLAN_MARGIN_MULTIPLIERS)) return base;

  const fallback = PLAN_MARGIN_MULTIPLIERS[planSlug];
  const raw = env[PLAN_MARGIN_ENV_VARS[planSlug]];
  if (raw === undefined || raw.trim() === "") return fallback;

  const parsed = Number(raw);
  if (
    !Number.isFinite(parsed) ||
    parsed < MARGIN_MULTIPLIER_MIN ||
    parsed > MARGIN_MULTIPLIER_MAX
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      `[pricing-config] ${PLAN_MARGIN_ENV_VARS[planSlug]}="${raw}" ignored (outside ${MARGIN_MULTIPLIER_MIN}-${MARGIN_MULTIPLIER_MAX}) — using ${fallback}.`
    );
    return fallback;
  }
  return parsed;
}

let cached: PricingConfig | null = null;

// Reads process.env once per process. Warnings are logged on that first
// read only — repeating them on every request would bury the logs, and
// env vars cannot change within a running process.
/**
 * The pricing config, optionally specialised to a plan.
 *
 * `planSlug` is OPTIONAL rather than required, and that is a compromise
 * worth naming: making it required would have been safer, and would also
 * have meant touching two dozen call sites at once, several of which
 * (the credits balance widget, the dashboard shell) only want the credit
 * price and have no plan in scope.
 *
 * The risk of an optional argument is precise and worth stating: a route
 * that RESERVES using the base multiplier while settlement charges the
 * plan's higher one holds less than it charges, which is the single
 * failure reserve/settle exists to prevent. That is why
 * scripts/tests/billing-coverage.test.mjs asserts that every route
 * calling reserveCredits passes a plan here — the omission cannot be
 * made silently.
 */
export function resolvePricingConfig(planSlug?: string | null): PricingConfig {
  if (!cached) {
    const { config, warnings } = parsePricingConfig(process.env);
    for (const w of warnings) {
      // eslint-disable-next-line no-console
      console.warn(
        `[pricing-config] ${w.variable}="${w.value}" ignored (${w.reason}) — using default.`
      );
    }
    cached = config;
  }
  if (planSlug === undefined || planSlug === null) return cached;
  return { ...cached, marginMultiplier: marginMultiplierForPlan(planSlug) };
}

// Test seam: lets a reproduction harness swap the config without setting
// real env vars. Never called from application code.
export function __setPricingConfigForTest(config: PricingConfig | null): void {
  cached = config;
}
