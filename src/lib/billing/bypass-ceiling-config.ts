// The two numbers, kept out of bypass-ceiling.ts on purpose — that file
// imports createAdminClient, which pulls in @supabase/supabase-js, which
// a test bundler with no external-dependency support cannot follow (see
// scripts/tests/load-ts.mjs). Same reasoning as lib/request-fingerprint.ts
// being kept out of lib/ai-circuit-breaker.ts: pure config deserves to be
// testable without dragging a database client along for the ride.
//
// Env-overridable, same parsing discipline as AGENT_LIMIT_* and
// MAX_DAILY_AI_CALLS elsewhere in this codebase — an unparseable or
// non-positive value warns and falls back to the default rather than
// being silently clamped into something that looks deliberate.
const DEFAULT_ADMIN_MONTHLY_EUR_CEILING = 40;
const DEFAULT_BETA_MONTHLY_EUR_CEILING = 5;

function readEurCeiling(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    // eslint-disable-next-line no-console
    console.warn(`[bypass-ceiling] ${envVar}="${raw}" ignored (must be a positive number) — using default.`);
    return fallback;
  }
  return parsed;
}

export function adminMonthlyEurCeiling(): number {
  return readEurCeiling("BYPASS_CEILING_ADMIN_EUR", DEFAULT_ADMIN_MONTHLY_EUR_CEILING);
}
export function betaMonthlyEurCeiling(): number {
  return readEurCeiling("BYPASS_CEILING_BETA_EUR", DEFAULT_BETA_MONTHLY_EUR_CEILING);
}
