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

let cached: PricingConfig | null = null;

// Reads process.env once per process. Warnings are logged on that first
// read only — repeating them on every request would bury the logs, and
// env vars cannot change within a running process.
export function resolvePricingConfig(): PricingConfig {
  if (cached) return cached;
  const { config, warnings } = parsePricingConfig(process.env);
  for (const w of warnings) {
    // eslint-disable-next-line no-console
    console.warn(
      `[pricing-config] ${w.variable}="${w.value}" ignored (${w.reason}) — using default.`
    );
  }
  cached = config;
  return config;
}

// Test seam: lets a reproduction harness swap the config without setting
// real env vars. Never called from application code.
export function __setPricingConfigForTest(config: PricingConfig | null): void {
  cached = config;
}
