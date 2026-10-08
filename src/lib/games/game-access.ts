import "server-only";
import type { User } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { resolveEffectivePlan } from "@/lib/billing/credits";
import { accountHasCapability } from "@/lib/billing/capability-gate";
import type { Plan } from "@/lib/billing/plans";
import { isFeatureOn } from "@/lib/flags/flags";

/**
 * WHO MAY MAKE A GAME (package 26): the switch "games", and the plan.
 *
 * THE PLAN IS THE SITE'S. A game is a page of code written from a
 * description and played in the browser — the Site's own work — so it
 * asks for the same capability (websiteBuilder) rather than inventing a
 * tier nobody has priced. It is not sold yet: the switch starts at the
 * owner and the test account, and opening it to everyone is when the
 * owner confirms the tier (docs/NEEDS-FROM-ELIAS.md).
 *
 * Read by every games route before anything is spent; the page reads the
 * same two to decide whether to draw the tool at all.
 */
export type GameGate = { ok: true; plan: Plan | null; isAdmin: boolean } | { ok: false; code: "not_enabled" | "not_included" };

export async function gameGate(user: User): Promise<GameGate> {
  if (!(await isFeatureOn("games", user))) return { ok: false, code: "not_enabled" };
  const isAdmin = isAdminEmail(user.email);
  const plan = await resolveEffectivePlan(user);
  if (!accountHasCapability(plan?.slug ?? "free", "websiteBuilder", isAdmin)) return { ok: false, code: "not_included" };
  return { ok: true, plan, isAdmin };
}
