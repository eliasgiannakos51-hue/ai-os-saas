import "server-only";
import type { User } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { resolveEffectivePlan } from "@/lib/billing/credits";
import type { Plan } from "@/lib/billing/plans";
import { maxRebuildsForPlan } from "@/lib/rebuild/limits";

/**
 * WHO MAY REBUILD: everybody who is signed in — no switch, and no plan
 * wall (the owner, 2026-10-23: the Free plan can try one). What stops
 * abuse is the credits every step spends (lib/rebuild/charge.ts) and a cap
 * on how many apps an account keeps (lib/rebuild/limits.ts); both are read
 * by every route before anything is spent.
 */
export type RebuildGate = { ok: true; plan: Plan | null; isAdmin: boolean; cap: number };

export async function rebuildGate(user: User): Promise<RebuildGate> {
  const isAdmin = isAdminEmail(user.email);
  const plan = await resolveEffectivePlan(user);
  return { ok: true, plan, isAdmin, cap: maxRebuildsForPlan(plan?.slug ?? "free", isAdmin) };
}
