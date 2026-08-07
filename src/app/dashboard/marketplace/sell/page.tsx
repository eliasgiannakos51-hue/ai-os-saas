import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Store } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { commissionPercent, isMarketplaceOpen } from "@/lib/marketplace/marketplace-config";
import {
  SellerDashboard,
  type SellableItem,
  type SellerAccount,
  type SellerListing,
} from "@/components/marketplace/seller-dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sell" };

/**
 * What this seller could list, gathered from the tables they already own
 * things in.
 *
 * Read through the caller's own RLS-scoped client, so "what can I sell"
 * is answered by the same policies that answer "what do I own" — there is
 * no separate notion of sellability that could drift from ownership.
 */
async function loadSellable(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<SellableItem[]> {
  const [websites, agents, missions, presentations, automations] = await Promise.all([
    supabase
      .from("user_websites")
      .select("id, name")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("user_agents").select("id, name").eq("user_id", userId).limit(50),
    supabase.from("ai_missions").select("id, goal").eq("user_id", userId).limit(50),
    supabase
      .from("user_presentations")
      .select("id, title")
      .eq("user_id", userId)
      .eq("status", "ready")
      .limit(50),
    supabase.from("user_automations").select("id, description").eq("user_id", userId).limit(50),
  ]);

  const label = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : fallback;

  return [
    ...(websites.data ?? []).map((r) => ({
      id: r.id,
      label: label(r.name, "Website"),
      kind: "website_template" as const,
    })),
    ...(agents.data ?? []).map((r) => ({
      id: r.id,
      label: label(r.name, "Agent"),
      kind: "agent_config" as const,
    })),
    ...(missions.data ?? []).map((r) => ({
      id: r.id,
      label: label(r.goal, "Mission"),
      kind: "mission_template" as const,
    })),
    ...(presentations.data ?? []).map((r) => ({
      id: r.id,
      label: label(r.title, "Presentation"),
      kind: "presentation_template" as const,
    })),
    ...(automations.data ?? []).map((r) => ({
      id: r.id,
      label: label(r.description, "Automation"),
      kind: "automation" as const,
    })),
  ];
}

export default async function SellPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("dashboard.marketplace");

  const [{ data: account }, { data: listings }, { data: sales }, sellable] = await Promise.all([
    supabase
      .from("seller_accounts")
      .select("onboarding_status, charges_enabled, payouts_enabled")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("marketplace_listings")
      .select("id, kind, title, price_cents, status, purchase_count")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("marketplace_purchases")
      .select("price_cents, seller_cents")
      .eq("seller_id", user.id)
      .eq("status", "paid")
      .limit(1000),
    loadSellable(supabase, user.id),
  ]);

  // Summed from the frozen per-purchase splits, not recomputed from
  // today's commission — see the note in the seller dashboard component.
  const paid = sales ?? [];
  const totals = {
    salesCount: paid.length,
    grossCents: paid.reduce((sum, s) => sum + (s.price_cents ?? 0), 0),
    earnedCents: paid.reduce((sum, s) => sum + (s.seller_cents ?? 0), 0),
  };

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link
          href="/dashboard/marketplace"
          className="mb-4 inline-flex items-center gap-1 text-xs text-muted hover:text-fg"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          {t("backToBrowse")}
        </Link>

        <PageHeader icon={Store} title={t("sellTitle")} description={t("sellDescription")} />

        <SellerDashboard
          open={isMarketplaceOpen()}
          commissionPercent={commissionPercent()}
          account={(account ?? null) as SellerAccount}
          listings={(listings ?? []) as unknown as SellerListing[]}
          sellable={sellable}
          totals={totals}
        />
      </div>
    </main>
  );
}
