/**
 * HOW MANY APPS AN ACCOUNT KEEPS (Rebuild), pure. The Free plan can try
 * ONE (the owner, 2026-10-23); the others scale with the plan. A cap on
 * rows, not on use: every step is also paid for in credits.
 */
const CAPS: Record<string, number> = { free: 1, starter: 5, growth: 15, professional: 40, ultimate: 100, enterprise: 100 };

export function maxRebuildsForPlan(planSlug: string, isAdmin = false): number {
  if (isAdmin) return 1_000;
  return CAPS[planSlug] ?? CAPS.free;
}
