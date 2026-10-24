import type { PlanSlug } from "@/lib/billing/plans";

/**
 * HOW MANY APPS ONE ACCOUNT MAY CONNECT BY ADDRESS. Connecting costs us
 * nothing (the person's own app answers), so the floor is not zero: a Free
 * account may connect one, so Connect works for everybody. The ceiling is
 * what keeps a list from growing without one.
 */
export const MCP_SERVER_LIMITS: Record<PlanSlug, number> = {
  free: 1,
  starter: 3,
  growth: 10,
  professional: 25,
  ultimate: 50,
  enterprise: 50,
};

export function maxMcpServersForPlan(slug: PlanSlug | null | undefined): number {
  return slug ? MCP_SERVER_LIMITS[slug] ?? MCP_SERVER_LIMITS.free : MCP_SERVER_LIMITS.free;
}
