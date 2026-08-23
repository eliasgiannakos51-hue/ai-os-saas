import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { isAddonSlug, resolveEntitlements, type Entitlements, type HeldAddon } from "@/lib/billing/addons";
import type { Plan } from "@/lib/billing/plans";

/**
 * What an account holds on top of its plan.
 *
 * FAILS TOWARDS THE PLAN, never towards more. An unreadable add-on table
 * gives the customer their plan's caps — which is what they had before
 * they bought anything, is visibly wrong to them, and is recoverable.
 * Failing the other way would hand out entitlements nobody paid for and
 * nothing would ever notice.
 */
export async function loadAddons(userId: string): Promise<HeldAddon[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("account_addons")
      .select("addon_slug, quantity, status, expires_at")
      .eq("user_id", userId);
    if (error) throw error;

    const out: HeldAddon[] = [];
    for (const row of data ?? []) {
      const slug = row.addon_slug;
      if (!isAddonSlug(slug)) continue;
      out.push({
        slug,
        quantity: Math.max(1, Number(row.quantity ?? 1) || 1),
        status: row.status === "cancelled" ? "cancelled" : "active",
        expiresAt: (row.expires_at as string | null) ?? null,
      });
    }
    return out;
  } catch (err) {
    logApiError("billing:addons", err, { stage: "load", userId });
    return [];
  }
}

/** THE ONE CALL every cap check makes. Plan and add-ons resolved
 *  together, so a check cannot read one and miss the other. */
export async function loadEntitlements(userId: string, plan: Plan | null): Promise<Entitlements> {
  return resolveEntitlements({ plan, addons: await loadAddons(userId) });
}
