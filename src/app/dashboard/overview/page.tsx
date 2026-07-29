import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { PageHeader } from "@/components/dashboard/page-header";
import { ModuleSummaryCard } from "@/components/overview/module-summary-card";
import { OverviewStats } from "@/components/overview/overview-stats";
import { CLASSIFIER_MODULES, moduleHref } from "@/lib/classifier-modules";
import type { ModuleRecord } from "@/types/module-record";

export const metadata: Metadata = {
  title: "Overview",
};

export default async function OverviewPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const summaries = await Promise.all(
    CLASSIFIER_MODULES.map(async (module) => {
      const [latestResult, recentResult] = await Promise.all([
        supabase
          .from(module.table)
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from(module.table)
          .select("id", { count: "exact", head: true })
          .gte("created_at", sevenDaysAgo),
      ]);

      return {
        module,
        href: moduleHref(module.slug),
        count: latestResult.count ?? 0,
        recentCount: recentResult.count ?? 0,
        latest:
          ((latestResult.data as ModuleRecord[] | null)?.[0] as
            | ModuleRecord
            | undefined) ?? null,
        loadError: latestResult.error?.message ?? recentResult.error?.message,
      };
    })
  );

  const totalEntries = summaries.reduce((sum, s) => sum + s.count, 0);
  const recentEntries = summaries.reduce((sum, s) => sum + s.recentCount, 0);
  const mostActive = summaries.reduce<(typeof summaries)[number] | null>(
    (max, s) => (s.count > (max?.count ?? -1) ? s : max),
    null
  );

  return (
    <main className="min-h-screen bg-background font-mono">
      <DashboardHeader email={user.email ?? ""} />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <PageHeader
          eyebrow="dashboard"
          title="Overview"
          description="all 13 modules at a glance."
        />

        <OverviewStats
          totalEntries={totalEntries}
          recentEntries={recentEntries}
          mostActiveTitle={mostActive ? mostActive.module.title.toLowerCase() : null}
          mostActiveCount={mostActive?.count ?? 0}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((summary) => (
            <ModuleSummaryCard
              key={summary.module.slug}
              module={summary.module}
              href={summary.href}
              count={summary.count}
              latest={summary.latest}
              loadError={summary.loadError}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
