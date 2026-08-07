"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Star } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { formatCents, MAX_REVIEW_BODY_CHARS } from "@/lib/marketplace/marketplace-config";
import { LISTING_KIND_SPECS, type ListingKind } from "@/lib/marketplace/listing-kinds";

export type ListingDetail = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  price_cents: number;
  preview: Record<string, unknown>;
  purchase_count: number;
  rating_sum: number;
  rating_count: number;
};

export type ListingReview = { id: string; rating: number; body: string; created_at: string };

/**
 * The listing page: what you get, what it costs, and — only after you own
 * it — where it went.
 *
 * The PREVIEW is structural by construction (a slide count, a schedule, a
 * character count), because it is built server-side from the payload by
 * lib/marketplace/payload.ts and the payload itself lives in a table this
 * page cannot read. There is no "show a bit of the product" toggle to get
 * wrong.
 */
export function ListingDetailView({
  listing,
  reviews,
  purchase,
  isSeller,
  open,
}: {
  listing: ListingDetail;
  reviews: ListingReview[];
  purchase: { id: string; installed_entity_id: string | null } | null;
  isSeller: boolean;
  open: boolean;
}) {
  const t = useTranslations("dashboard.marketplace");
  const locale = useLocale();
  const { addToast } = useToast();

  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");

  const spec = LISTING_KIND_SPECS[listing.kind as ListingKind];
  const average = listing.rating_count > 0 ? listing.rating_sum / listing.rating_count : null;

  async function buy() {
    setBusy(true);
    try {
      const res = await fetch(`/api/marketplace/listings/${listing.id}/purchase`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        addToast(data?.error || t("errors.generic"), "error");
        return;
      }
      // Straight to Stripe. Nothing is installed here — fulfilment
      // happens in the webhook, on Stripe's signed word that the money
      // moved, not because this browser reached a success URL.
      window.location.href = data.url;
    } catch {
      addToast(t("errors.generic"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function submitReview() {
    setBusy(true);
    try {
      const res = await fetch(`/api/marketplace/listings/${listing.id}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, body: reviewBody }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        addToast(data?.error || t("errors.generic"), "error");
        return;
      }
      addToast(t("reviewSaved"), "success");
      setReviewBody("");
    } catch {
      addToast(t("errors.generic"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full border border-border px-2 py-0.5 text-muted">
            {t(`kinds.${spec?.labelKey ?? "other"}`)}
          </span>
          <span className="rounded-full border border-border px-2 py-0.5 text-muted">
            {t(`categories.${listing.category}`)}
          </span>
          {average !== null ? (
            <span className="flex items-center gap-1 text-amber-400">
              <Star className="h-3 w-3 fill-current" aria-hidden="true" />
              {t("ratingSummary", { rating: average.toFixed(1), count: listing.rating_count })}
            </span>
          ) : null}
        </div>
        <h1 className="text-xl font-semibold">{listing.title}</h1>
        {listing.summary ? <p className="text-sm text-muted">{listing.summary}</p> : null}
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-panel/60 p-4">
        <span className="text-lg font-semibold">{formatCents(listing.price_cents, locale)}</span>

        {purchase ? (
          <span className="text-sm text-emerald-400">{t("owned")}</span>
        ) : isSeller ? (
          <span className="text-sm text-muted">{t("yourListing")}</span>
        ) : !open ? (
          <span className="text-sm text-muted">{t("notOpenShort")}</span>
        ) : (
          <button type="button" className="btn-primary" onClick={() => void buy()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {t("buy")}
          </button>
        )}

        <span className="ml-auto text-[11px] text-muted">
          {t("salesCount", { count: listing.purchase_count })}
        </span>
      </div>

      {listing.description ? (
        <section className="rounded-2xl border border-border bg-panel/60 p-4">
          <h2 className="mb-2 text-sm font-medium">{t("aboutThis")}</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{listing.description}</p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-panel/60 p-4">
        <h2 className="mb-2 text-sm font-medium">{t("whatYouGet")}</h2>
        <dl className="grid gap-1 text-xs text-muted">
          {Object.entries(listing.preview).map(([key, value]) => (
            <div key={key} className="flex gap-2">
              {/* `t.has` first, and the raw key as the fallback. The
                  preview object's keys come from the payload builder, so
                  a kind added later would otherwise render its new key as
                  next-intl's MISSING_MESSAGE — which reaches the user as
                  the raw dotted path. */}
              <dt className="min-w-32 font-medium">
                {t.has(`previewKeys.${key}`) ? t(`previewKeys.${key}`) : key}
              </dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[11px] text-muted">{t("installNote")}</p>
      </section>

      {purchase ? (
        <section className="space-y-3 rounded-2xl border border-border bg-panel/60 p-4">
          <h2 className="text-sm font-medium">{t("leaveReview")}</h2>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                aria-label={t("rateN", { n })}
                aria-pressed={rating === n}
              >
                <Star
                  className={`h-5 w-5 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-muted"}`}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
          <textarea
            className="input min-h-[72px]"
            value={reviewBody}
            maxLength={MAX_REVIEW_BODY_CHARS}
            onChange={(e) => setReviewBody(e.target.value)}
            placeholder={t("reviewPlaceholder")}
            aria-label={t("leaveReview")}
          />
          <button type="button" className="btn-primary" onClick={() => void submitReview()} disabled={busy}>
            {t("submitReview")}
          </button>
        </section>
      ) : null}

      {reviews.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">{t("reviews")}</h2>
          {reviews.map((review) => (
            <article key={review.id} className="rounded-xl border border-border bg-panel/60 p-3">
              <div className="mb-1 flex items-center gap-1 text-amber-400" aria-label={t("rateN", { n: review.rating })}>
                {Array.from({ length: review.rating }, (_, i) => (
                  <Star key={i} className="h-3 w-3 fill-current" aria-hidden="true" />
                ))}
              </div>
              {review.body ? <p className="text-xs text-muted">{review.body}</p> : null}
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
