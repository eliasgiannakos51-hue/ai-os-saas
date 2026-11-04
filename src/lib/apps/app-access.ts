import "server-only";
import type { User } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { resolveEffectivePlan } from "@/lib/billing/credits";
import { accountHasCapability } from "@/lib/billing/capability-gate";
import type { Plan } from "@/lib/billing/plans";

/**
 * WHO MAY MAKE AN APP (κομμάτι 2): the plan, behind the switch
 * "apps-tool" which the routes and the page check separately.
 *
 * THE CAPABILITY IS THE SITE'S, for the same reason Games borrows it
 * (lib/games/game-access.ts): an app is a thing built from a
 * description and published at its own address — the Site's own work —
 * and `websiteBuilder` is already false on Free and true from Starter
 * up, which is exactly what the catalogue entry for this tool has said
 * since before it was built (`minPlan: "starter"`,
 * src/lib/billing/feature-catalog.ts). Inventing a capability nobody
 * has priced would make the pricing table and the gate disagree.
 *
 * Read by every apps route before anything is spent; the page reads the
 * same gate to decide whether to draw the tool at all.
 */
export type AppGate = { ok: true; plan: Plan | null; isAdmin: boolean } | { ok: false; code: "not_included" };

export async function appGate(user: User): Promise<AppGate> {
  const isAdmin = isAdminEmail(user.email);
  const plan = await resolveEffectivePlan(user);
  if (!accountHasCapability(plan?.slug ?? "free", "websiteBuilder", isAdmin)) return { ok: false, code: "not_included" };
  return { ok: true, plan, isAdmin };
}
