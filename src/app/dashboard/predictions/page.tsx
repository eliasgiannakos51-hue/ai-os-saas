import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { PREDICTIONS_ICON } from "@/lib/module-icons";
import { PredictionsPanel } from "@/components/predictions/predictions-panel";
import type { Insight } from "@/components/onboarding/insight-list";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.predictions");
}

/**
 * WHAT THE NUMBERS IN THIS ACCOUNT ARE DOING — with a page of its own.
 *
 * NOTHING HERE IS NEW EXCEPT THE ROUTE, and that is the point of the
 * 2026-09-05 structure: lib/insights/detectors.ts has been finding these
 * patterns in TypeScript for as long as it has existed, api/insights
 * stores them, and components/onboarding/insight-list.tsx renders them
 * with their sample size and a link to the rows. The only thing missing
 * was somewhere to go. The cards appeared inside /dashboard/overview and
 * inside the OWNER-ONLY /dashboard/business-health, so an ordinary user
 * who scrolled past one could not get back to it and could not ask for
 * another pass.
 *
 * READ SERVER-SIDE, exactly as the overview reads it — same table, same
 * filter, same order, same cap. Two screens showing different subsets of
 * "your insights" because one of them paginated differently is a
 * discrepancy nobody would think to look for.
 */
const INSIGHT_LIMIT = 20;

export default async function PredictionsPage() {
  const t = await getTranslations("dashboard.predictions");
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = createClient();
  const { data } = await supabase
    .from("user_insights")
    .select("id, detector, module_slug, headline, detail, evidence, sample_size, created_at")
    .eq("user_id", user.id)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(INSIGHT_LIMIT);

  return (
    <div className="space-y-6">
      <PageHeader icon={PREDICTIONS_ICON} title={t("title")} description={t("description")} helpKey="help.predictions" />
      <PredictionsPanel initial={(data ?? []) as unknown as Insight[]} />
    </div>
  );
}
