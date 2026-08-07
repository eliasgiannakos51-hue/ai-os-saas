"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Store } from "lucide-react";
import { ListLayout } from "@/components/ui/list-layout";
import { EntityCard } from "@/components/ui/entity-card";
import { formatCents, LISTING_CATEGORIES, LISTING_SORTS, type ListingSort } from "@/lib/marketplace/marketplace-config";
import { LISTING_KINDS, LISTING_KIND_SPECS, type ListingKind } from "@/lib/marketplace/listing-kinds";

export type BrowseListing = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  category: string;
  price_cents: number;
  purchase_count: number;
  rating_sum: number;
  rating_count: number;
};

/**
 * The shop window.
 *
 * Filtering and sorting happen HERE, over the page's own list, rather
 * than by re-querying per keystroke. The browse route caps at 100
 * listings, so the whole set is already in memory and a round trip per
 * character would be slower and noisier for no more accuracy. When the
 * marketplace outgrows one page of results that stops being true, and
 * the sort parameters the API already accepts are what it grows into.
 */
export function MarketplaceBrowse({
  listings,
  open,
}: {
  listings: BrowseListing[];
  open: boolean;
}) {
  const t = useTranslations("dashboard.marketplace");
  const locale = useLocale();

  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<ListingKind | "">("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<ListingSort>("newest");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = listings.filter((l) => {
      if (kind && l.kind !== kind) return false;
      if (category && l.category !== category) return false;
      if (q && !l.title.toLowerCase().includes(q) && !l.summary.toLowerCase().includes(q)) return false;
      return true;
    });

    const byRating = (l: BrowseListing) => (l.rating_count > 0 ? l.rating_sum / l.rating_count : 0);
    switch (sort) {
      case "popular":
        return [...rows].sort((a, b) => b.purchase_count - a.purchase_count);
      case "price_low":
        return [...rows].sort((a, b) => a.price_cents - b.price_cents);
      case "price_high":
        return [...rows].sort((a, b) => b.price_cents - a.price_cents);
      case "rating":
        return [...rows].sort((a, b) => byRating(b) - byRating(a));
      default:
        return rows;
    }
  }, [listings, search, kind, category, sort]);

  return (
    <ListLayout
      newAction={
        <a className="btn-primary" href="/dashboard/marketplace/sell">
          {t("sellCta")}
        </a>
      }
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder={t("searchPlaceholder")}
      searchId="marketplace-search"
      filters={
        <>
          <select
            className="input w-auto text-xs"
            value={kind}
            onChange={(e) => setKind(e.target.value as ListingKind | "")}
            aria-label={t("filterKind")}
          >
            <option value="">{t("allKinds")}</option>
            {LISTING_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${LISTING_KIND_SPECS[k].labelKey}`)}
              </option>
            ))}
          </select>

          <select
            className="input w-auto text-xs"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label={t("filterCategory")}
          >
            <option value="">{t("allCategories")}</option>
            {LISTING_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`categories.${c}`)}
              </option>
            ))}
          </select>

          <select
            className="input w-auto text-xs"
            value={sort}
            onChange={(e) => setSort(e.target.value as ListingSort)}
            aria-label={t("sortLabel")}
          >
            {LISTING_SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`sorts.${s}`)}
              </option>
            ))}
          </select>
        </>
      }
      meta={<span className="text-[11px] text-muted">{t("resultCount", { count: filtered.length })}</span>}
    >
      {!open ? (
        <p className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-300">
          {t("notOpenNotice")}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          {listings.length === 0 ? t("emptyState") : t("noMatches")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((listing, index) => (
            <EntityCard
              key={listing.id}
              icon={Store}
              accentSlug="marketplace"
              title={listing.title}
              description={listing.summary}
              href={`/dashboard/marketplace/${listing.id}`}
              index={index}
              tags={[
                {
                  key: "kind",
                  label: t(`kinds.${LISTING_KIND_SPECS[listing.kind as ListingKind]?.labelKey ?? "other"}`),
                  tone: "accent" as const,
                },
                { key: "price", label: formatCents(listing.price_cents, locale) },
                ...(listing.rating_count > 0
                  ? [
                      {
                        key: "rating",
                        label: t("ratingSummary", {
                          // One decimal, computed here rather than stored:
                          // the aggregate columns hold the sum and the
                          // count so that a changed review can be
                          // recomputed rather than un-incremented.
                          rating: (listing.rating_sum / listing.rating_count).toFixed(1),
                          count: listing.rating_count,
                        }),
                      },
                    ]
                  : []),
              ]}
              status={
                listing.purchase_count > 0
                  ? { label: t("salesCount", { count: listing.purchase_count }), tone: "success" as const }
                  : null
              }
            />
          ))}
        </div>
      )}
    </ListLayout>
  );
}
