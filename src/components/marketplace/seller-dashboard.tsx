"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import {
  LISTING_CATEGORIES,
  MAX_LISTING_SUMMARY_CHARS,
  MAX_LISTING_TITLE_CHARS,
  MAX_PRICE_CENTS,
  MIN_PRICE_CENTS,
  formatCents,
  splitPrice,
} from "@/lib/marketplace/marketplace-config";
import { LISTING_KINDS, LISTING_KIND_SPECS, type ListingKind } from "@/lib/marketplace/listing-kinds";

export type SellableItem = { id: string; label: string; kind: ListingKind };

export type SellerListing = {
  id: string;
  kind: string;
  title: string;
  price_cents: number;
  status: string;
  purchase_count: number;
};

export type SellerAccount = {
  onboarding_status: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
} | null;

/**
 * The seller's side: onboarding, listing something, and what has sold.
 *
 * The earnings figure shown here is the SUM OF FROZEN per-purchase
 * splits, computed on the server from `seller_cents` on each row — not
 * today's commission applied to today's prices. Changing the platform fee
 * must not retroactively rewrite what past sales earned, and a dashboard
 * that recomputes is a dashboard that will one day disagree with a
 * payout.
 */
export function SellerDashboard({
  open,
  commissionPercent: commission,
  account,
  listings,
  sellable,
  totals,
}: {
  open: boolean;
  commissionPercent: number;
  account: SellerAccount;
  listings: SellerListing[];
  sellable: SellableItem[];
  totals: { salesCount: number; grossCents: number; earnedCents: number };
}) {
  const t = useTranslations("dashboard.marketplace");
  const locale = useLocale();
  const { addToast } = useToast();

  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<ListingKind>("presentation_template");
  const [sourceId, setSourceId] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [priceCents, setPriceCents] = useState(1900);
  const [issues, setIssues] = useState<string[]>([]);

  const options = sellable.filter((item) => item.kind === kind);
  const split = splitPrice(priceCents, commission);
  const onboarded = account?.onboarding_status === "active";

  async function startOnboarding() {
    setBusy(true);
    try {
      const res = await fetch("/api/marketplace/seller", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        addToast(data?.error || t("errors.generic"), "error");
        return;
      }
      window.location.href = data.url;
    } catch {
      addToast(t("errors.generic"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setIssues([]);
    try {
      const res = await fetch("/api/marketplace/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, sourceId, title, summary, description, category, priceCents }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        // The security check's findings are shown in full rather than
        // collapsed into "rejected". A seller who cannot see what was
        // wrong cannot fix it, and files a support ticket instead.
        if (Array.isArray(data?.issues)) setIssues(data.issues);
        addToast(data?.error || t("errors.generic"), "error");
        return;
      }
      addToast(t("listed"), "success");
      window.location.reload();
    } catch {
      addToast(t("errors.generic"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {!open ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-300">
          {t("notOpenSellerNotice")}
        </p>
      ) : null}

      <section className="rounded-2xl border border-border bg-panel/60 p-4">
        <h2 className="mb-2 text-sm font-medium">{t("payouts")}</h2>
        {onboarded ? (
          <p className="text-xs text-emerald-400">{t("payoutsReady")}</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted">{t("payoutsIntro", { percent: commission })}</p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void startOnboarding()}
              disabled={busy || !open}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {account?.onboarding_status === "pending" ? t("continueOnboarding") : t("startOnboarding")}
            </button>
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label={t("statSales")} value={String(totals.salesCount)} />
        <Stat label={t("statGross")} value={formatCents(totals.grossCents, locale)} />
        <Stat label={t("statEarned")} value={formatCents(totals.earnedCents, locale)} />
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-panel/60 p-4">
        <h2 className="text-sm font-medium">{t("listSomething")}</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">{t("kindLabel")}</span>
            <select
              className="input"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as ListingKind);
                setSourceId("");
              }}
            >
              {LISTING_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kinds.${LISTING_KIND_SPECS[k].labelKey}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">{t("sourceLabel")}</span>
            <select className="input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">{options.length ? t("choose") : t("nothingToList")}</option>
              {options.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">{t("titleLabel")}</span>
          <input
            className="input"
            value={title}
            maxLength={MAX_LISTING_TITLE_CHARS}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">{t("summaryLabel")}</span>
          <input
            className="input"
            value={summary}
            maxLength={MAX_LISTING_SUMMARY_CHARS}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">{t("descriptionLabel")}</span>
          <textarea
            className="input min-h-[80px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">{t("categoryLabel")}</span>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {LISTING_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`categories.${c}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">
              {t("priceLabel", { price: formatCents(priceCents, locale) })}
            </span>
            <input
              type="range"
              className="w-full"
              min={MIN_PRICE_CENTS}
              max={MAX_PRICE_CENTS}
              step={100}
              value={priceCents}
              onChange={(e) => setPriceCents(Number(e.target.value))}
            />
          </label>
        </div>

        {/* The seller's own number, computed with the SAME function the
            server sends to Stripe. Two copies of this arithmetic is how a
            dashboard promises a payout the transfer does not match. */}
        <p className="text-[11px] text-muted">
          {t("splitNote", {
            seller: formatCents(split.sellerCents, locale),
            fee: formatCents(split.platformFeeCents, locale),
            percent: commission,
          })}
        </p>

        {issues.length > 0 ? (
          <ul className="space-y-1 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-[11px] text-red-300">
            {issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        ) : null}

        <button
          type="button"
          className="btn-primary"
          onClick={() => void publish()}
          disabled={busy || !open || !onboarded || !sourceId || title.trim().length < 4}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {t("publishListing")}
        </button>
      </section>

      {listings.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">{t("yourListings")}</h2>
          {listings.map((listing) => (
            <a
              key={listing.id}
              href={`/dashboard/marketplace/${listing.id}`}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-panel/60 p-3 text-xs hover:border-accent/50"
            >
              <span className="font-medium">{listing.title}</span>
              <span className="text-muted">{formatCents(listing.price_cents, locale)}</span>
              <span className="text-muted">{t(`statuses.${listing.status}`)}</span>
              <span className="ml-auto text-muted">
                {t("salesCount", { count: listing.purchase_count })}
              </span>
            </a>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-panel/60 p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
