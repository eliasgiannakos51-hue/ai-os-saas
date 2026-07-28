import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";
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
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <p className="text-xs tracking-widest text-amber-500">AI_OS //</p>
          <h1 className="text-lg font-bold text-foreground">dashboard</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-xs text-muted sm:inline">
            {user.email}
          </span>
          <LogoutButton />
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
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
