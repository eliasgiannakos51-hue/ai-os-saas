import "server-only";
import type { User } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { resolveEffectivePlan } from "@/lib/billing/credits";
import { planMeetsMinimum, type Plan, type PlanSlug } from "@/lib/billing/plans";

/**
 * WHO MAY HAVE A DOCUMENT WRITTEN (MASTER 16, package 14): the plan. No
 * switch decides it since 2026-10-23 (the owner opened it to everybody).
 * Read by api/documents/generate and api/documents/[id]/edit before
 * anything is spent; the page reads the same plan to decide whether to
 * draw the writer at all.
 *
 * THE PLAN. Starter and up, the tier Slides and Posts — the other two
 * tools that write from a description — already carry
 * (src/lib/billing/feature-catalog.ts, entry "documentWriter").
 */
export const DOCUMENT_WRITER_MIN_PLAN: PlanSlug = "starter";

export type WriterGate = { ok: true; plan: Plan | null; isAdmin: boolean } | { ok: false; code: "not_included" };

export async function writerGate(user: User): Promise<WriterGate> {
  const isAdmin = isAdminEmail(user.email);
  const plan = await resolveEffectivePlan(user);
  if (!isAdmin && !planMeetsMinimum(plan?.slug ?? "free", DOCUMENT_WRITER_MIN_PLAN)) return { ok: false, code: "not_included" };
  return { ok: true, plan, isAdmin };
}
