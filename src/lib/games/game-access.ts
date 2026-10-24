import "server-only";
import type { User } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { resolveEffectivePlan } from "@/lib/billing/credits";
import { accountHasCapability } from "@/lib/billing/capability-gate";
import type { Plan } from "@/lib/billing/plans";

/**
 * WHO MAY MAKE A GAME (package 26): the plan. Open to everyone since
 * 2026-10-24 (the owner's final grid message: no switch) — the switch
 * "games" is gone.
 *
 * THE PLAN IS THE SITE'S. A game is a page of code written from a
 * description and played in the browser — the Site's own work — so it
 * asks for the same capability (websiteBuilder) rather than inventing a
 * tier nobody has priced.
 *
 * Read by every games route before anything is spent; the page reads the
 * same gate to decide whether to draw the tool at all.
 */
export type GameGate = { ok: true; plan: Plan | null; isAdmin: boolean } | { ok: false; code: "not_included" };

export async function gameGate(user: User): Promise<GameGate> {
  const isAdmin = isAdminEmail(user.email);
  const plan = await resolveEffectivePlan(user);
  if (!accountHasCapability(plan?.slug ?? "free", "websiteBuilder", isAdmin)) return { ok: false, code: "not_included" };
  return { ok: true, plan, isAdmin };
}
