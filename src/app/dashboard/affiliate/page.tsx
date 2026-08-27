import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Share2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { AffiliateDashboard } from "@/components/affiliate/affiliate-dashboard";
import { getAffiliateForUser, getAffiliateStats } from "@/lib/affiliate/store";
import { connectConfigured } from "@/lib/affiliate/connect";
import { getSiteUrl } from "@/lib/site-url";
import { COMMISSION_MONTHS, MIN_PAYOUT_CENTS } from "@/lib/affiliate/rules";

// The tab title comes from the same message key the sidebar renders, so
// the nav item and the browser tab cannot drift apart (main's
// sidebar-naming gate enforces this for every dashboard page).
export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.affiliate");
}

// Reads live commission rows on every view — a balance that is one
// navigation stale is a support ticket.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AffiliatePage() {
  const t = await getTranslations("dashboard.affiliate");
  const supabase = createClient();

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const affiliate = await getAffiliateForUser(user.id);
  const stats = affiliate ? await getAffiliateStats(affiliate.id) : null;

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader
          icon={Share2}
          title={t("title")}
          description={t("description")}
          helpKey="help.affiliate"
        />
        <AffiliateDashboard
          code={affiliate?.code ?? null}
          status={affiliate?.status ?? null}
          rate={affiliate ? Number(affiliate.commission_rate) : null}
          hasConnectAccount={Boolean(affiliate?.stripe_account_id)}
          payoutsEnabled={Boolean(affiliate?.payouts_enabled)}
          connectAvailable={connectConfigured()}
          stats={stats}
          siteUrl={getSiteUrl()}
          commissionMonths={COMMISSION_MONTHS}
          minPayoutCents={MIN_PAYOUT_CENTS}
        />
      </div>
    </main>
  );
}
