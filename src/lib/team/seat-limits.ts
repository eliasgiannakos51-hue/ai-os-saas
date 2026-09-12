import type { PlanSlug } from "@/lib/billing/plans";

/**
 * HOW MANY PEOPLE MAY BE IN A TEAM, PER PLAN.
 *
 * WHAT WAS THERE, and why it was not this. `api/team/invite` refuses an
 * invitation once the active member count reaches
 * `user_metadata.seat_count` — the number of seats actually PAID for on
 * Professional — and exempts `teamSeatsIncluded` plans (Ultimate,
 * Enterprise) entirely. That is a real, working billing check and it
 * stays.
 *
 * What it is not is a PLAN limit. A Professional account could buy
 * twenty seats and have twenty members, so "Team" on Professional and
 * "Team" on Ultimate differed only in who paid per head — which makes
 * the two tiers the same feature at different prices, and makes the
 * pricing table unable to say anything useful about either.
 *
 * So: Professional is capped at five, Ultimate and Enterprise are
 * unbounded and included, and everybody else is zero. Both ceilings are
 * enforced in the same route, one after the other — the plan first,
 * because "your plan allows five" and "you have paid for three" are
 * different sentences and a person needs the right one.
 */
export const UNLIMITED_SEATS = Number.POSITIVE_INFINITY;

export const DEFAULT_SEAT_LIMITS: Record<PlanSlug, number> = {
  free: 0,
  starter: 0,
  growth: 0,
  professional: 5,
  ultimate: UNLIMITED_SEATS,
  enterprise: UNLIMITED_SEATS,
};

export const SEAT_LIMIT_ENV_VARS: Record<PlanSlug, string> = {
  free: "SEAT_LIMIT_FREE",
  starter: "SEAT_LIMIT_STARTER",
  growth: "SEAT_LIMIT_GROWTH",
  professional: "SEAT_LIMIT_PROFESSIONAL",
  ultimate: "SEAT_LIMIT_ULTIMATE",
  enterprise: "SEAT_LIMIT_ENTERPRISE",
};

const MAX_SANE_SEAT_LIMIT = 10_000;

export type SeatLimitWarning = { variable: string; value: string; reason: string };

export function parseSeatLimits(env: Record<string, string | undefined>): {
  limits: Record<PlanSlug, number>;
  warnings: SeatLimitWarning[];
} {
  const limits = { ...DEFAULT_SEAT_LIMITS };
  const warnings: SeatLimitWarning[] = [];

  for (const slug of Object.keys(DEFAULT_SEAT_LIMITS) as PlanSlug[]) {
    const variable = SEAT_LIMIT_ENV_VARS[slug];
    const raw = env[variable];
    if (raw === undefined || raw.trim() === "") continue;
    const trimmed = raw.trim();
    if (trimmed.toLowerCase() === "unlimited") {
      limits[slug] = UNLIMITED_SEATS;
      continue;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0) {
      warnings.push({ variable, value: raw, reason: "not a non-negative integer" });
      continue;
    }
    if (parsed > MAX_SANE_SEAT_LIMIT) {
      warnings.push({
        variable,
        value: raw,
        reason: `above the sane ceiling of ${MAX_SANE_SEAT_LIMIT} — write "unlimited" if that is what you mean`,
      });
      continue;
    }
    limits[slug] = parsed;
  }
  return { limits, warnings };
}

let cachedSeatLimits: Record<PlanSlug, number> | null = null;

export function resolveSeatLimits(): Record<PlanSlug, number> {
  if (cachedSeatLimits) return cachedSeatLimits;
  const { limits, warnings } = parseSeatLimits(process.env as Record<string, string | undefined>);
  for (const w of warnings) {
    // eslint-disable-next-line no-console
    console.warn(`[seat-limits] ${w.variable}="${w.value}" ignored (${w.reason}) — using default.`);
  }
  cachedSeatLimits = limits;
  return limits;
}

/** FAILS CLOSED: an unknown slug gets zero seats, not unlimited. */
export function maxSeatsForPlan(slug: PlanSlug | null | undefined): number {
  const limits = resolveSeatLimits();
  return limits[(slug ?? "free") as PlanSlug] ?? 0;
}
