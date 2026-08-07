import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { MARKETPLACE_ICON } from "@/lib/module-icons";
import { isMarketplaceOpen } from "@/lib/marketplace/marketplace-config";
import { MarketplaceBrowse, type BrowseListing } from "@/components/marketplace/marketplace-browse";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Marketplace" };

/**
 * This page used to be an honest empty state: no table, no listings, no
 * buy/sell flow. It is now the real browse surface.
 *
 * It renders whether or not the marketplace is OPEN. `MARKETPLACE_ENABLED`
 * gates the paths that move money — onboarding, publishing, buying — and
 * not the ability to look, because the alternative is a page that says
 * "coming soon" while a fully-built feature sits behind it, which is the
 * "Coming Soon badge on something that reads as real" this page was
 * rewritten once to get rid of.
 */
export default async function MarketplacePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("dashboard.marketplace");

  const { data: listings } = await supabase
    .from("marketplace_listings")
    .select("id, kind, title, summary, category, price_cents, purchase_count, rating_sum, rating_count")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(100);

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader icon={MARKETPLACE_ICON} title={t("title")} description={t("description")} />

        <MarketplaceBrowse
          listings={(listings ?? []) as unknown as BrowseListing[]}
          open={isMarketplaceOpen()}
        />
      </div>
    </main>
  );
}
