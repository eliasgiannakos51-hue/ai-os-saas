import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isMarketplaceOpen } from "@/lib/marketplace/marketplace-config";
import {
  ListingDetailView,
  type ListingDetail,
  type ListingReview,
} from "@/components/marketplace/listing-detail";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Listing" };

export default async function ListingPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("dashboard.marketplace");

  // No status filter: RLS already decides what this caller may see — a
  // seller's own listing in any status, everybody else's only when
  // published. Somebody else's draft simply does not exist from here,
  // which is why a miss is a 404 rather than a 403.
  const { data: listing } = await supabase
    .from("marketplace_listings")
    .select(
      "id, seller_id, kind, title, summary, description, category, price_cents, preview, purchase_count, rating_sum, rating_count"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!listing) {
    notFound();
  }

  const [{ data: reviews }, { data: purchase }] = await Promise.all([
    supabase
      .from("marketplace_reviews")
      .select("id, rating, body, created_at")
      .eq("listing_id", params.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("marketplace_purchases")
      .select("id, installed_entity_id")
      .eq("listing_id", params.id)
      .eq("buyer_id", user.id)
      .eq("status", "paid")
      .maybeSingle(),
  ]);

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

        <ListingDetailView
          listing={listing as unknown as ListingDetail}
          reviews={(reviews ?? []) as unknown as ListingReview[]}
          purchase={purchase ?? null}
          isSeller={listing.seller_id === user.id}
          open={isMarketplaceOpen()}
        />
      </div>
    </main>
  );
}
