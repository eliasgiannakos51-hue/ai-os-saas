import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Store } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/empty-state";
import { MARKETPLACE_ICON } from "@/lib/module-icons";

export const metadata: Metadata = {
  title: "Marketplace",
};

// No table, no listings, no buy/sell flow yet — the previous version of
// this page showed hardcoded demo listings with "Coming Soon" badges,
// which read as real (if unpurchasable) products. Replaced with a plain,
// honest empty state instead, per the brief: nothing fake shown as if it
// exists.
export default async function MarketplacePage() {
  const t = await getTranslations("dashboard.marketplace");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader icon={MARKETPLACE_ICON} title={t("title")} description={t("description")} />

        <EmptyState icon={Store}>
          <p>{t("emptyState")}</p>
          <button
            type="button"
            disabled
            title={t("comingSoon")}
            aria-disabled="true"
            className="mt-4 inline-flex min-h-[44px] cursor-not-allowed items-center justify-center rounded-xl border border-border px-4 py-2 text-sm font-semibold text-muted opacity-60 sm:min-h-0"
          >
            {t("publishButton")}
          </button>
        </EmptyState>
      </div>
    </main>
  );
}
