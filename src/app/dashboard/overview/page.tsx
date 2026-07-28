import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { ModuleSummaryCard } from "@/components/overview/module-summary-card";
import { CLASSIFIER_MODULES, moduleHref } from "@/lib/classifier-modules";
import type { ModuleRecord } from "@/types/module-record";

export default async function OverviewPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const summaries = await Promise.all(
    CLASSIFIER_MODULES.map(async (module) => {
      const { data, count, error } = await supabase
        .from(module.table)
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(1);

      return {
        module,
        href: moduleHref(module.slug),
        count: count ?? 0,
        latest: ((data as ModuleRecord[] | null)?.[0] as ModuleRecord | undefined) ?? null,
        loadError: error?.message,
      };
    })
  );

  return (
    <main className="min-h-screen bg-background font-mono">
      <DashboardHeader email={user.email ?? ""} />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h2 className="text-sm uppercase tracking-widest text-muted">
            overview
          </h2>
          <p className="mt-1 text-sm text-muted">
            all 13 modules at a glance.
          </p>
        </div>

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
