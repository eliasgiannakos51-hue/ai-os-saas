import "server-only";
import type { User } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { resolveEffectivePlan } from "@/lib/billing/credits";
import { planMeetsMinimum, type Plan, type PlanSlug } from "@/lib/billing/plans";
import { isFeatureOn } from "@/lib/flags/flags";

/**
 * WHO MAY HAVE A DOCUMENT WRITTEN (MASTER 16, package 14): the switch
 * "document-writer", and the plan. Read by api/documents/generate and
 * api/documents/[id]/edit before anything is spent; the page reads the
 * same two to decide whether to draw the writer at all.
 *
 * THE PLAN. Starter and up, the tier Slides and Posts — the other two
 * tools that write from a description — already carry
 * (src/lib/billing/feature-catalog.ts). It is not sold yet: the catalog
 * entry "documentWriter" says so until the switch is opened to everyone,
 * which is when the owner confirms the tier.
 */
export const DOCUMENT_WRITER_MIN_PLAN: PlanSlug = "starter";

export type WriterGate = { ok: true; plan: Plan | null; isAdmin: boolean } | { ok: false; code: "not_enabled" | "not_included" };

export async function writerGate(user: User): Promise<WriterGate> {
  if (!(await isFeatureOn("document-writer", user))) return { ok: false, code: "not_enabled" };
  const isAdmin = isAdminEmail(user.email);
  const plan = await resolveEffectivePlan(user);
  if (!isAdmin && !planMeetsMinimum(plan?.slug ?? "free", DOCUMENT_WRITER_MIN_PLAN)) return { ok: false, code: "not_included" };
  return { ok: true, plan, isAdmin };
}
