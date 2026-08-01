import { redirect } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ErrorMessage } from "@/components/error-message";
import { GenericAddForm } from "@/components/modules/generic-add-form";
import { GenericList } from "@/components/modules/generic-list";
import { UpgradeRequired } from "@/components/billing/upgrade-required";
import type { ModuleConfig } from "@/lib/modules";
import type { ModuleRecord } from "@/types/module-record";
import { getPlan, planMeetsMinimum } from "@/lib/billing/plans";
import { resolvePlanSlug } from "@/lib/billing/credits";
import { isAdminEmail } from "@/lib/admin";

// Shared body for every "Build" module page (/dashboard/agents, /websites,
// /apps, /images, /videos) — same shape as dashboard/[module]/page.tsx, just
// pointed at a hardcoded config instead of resolving one from a route param,
// since these live at their own literal routes rather than the dynamic
// [module] catch-all (see lib/build-modules.ts for why they're a separate
// array from lib/modules.ts's MODULES).
//
// config.minPlanSlug (set for websites/apps/images/videos) gates the whole
// page — below that plan, an "Upgrade Required" panel replaces the normal
// add-form + list content instead of allowing access.
export async function BuildModulePage({
  config,
  icon,
}: {
  config: ModuleConfig;
  icon: LucideIcon;
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const isAdmin = isAdminEmail(user.email);
  const planSlug = resolvePlanSlug(user);

  if (!isAdmin && config.minPlanSlug && !planMeetsMinimum(planSlug, config.minPlanSlug)) {
    const requiredPlan = getPlan(config.minPlanSlug);
    return (
      <main className="min-h-full">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <PageHeader icon={icon} title={config.title} />
          <UpgradeRequired
            featureName={config.title}
            planName={requiredPlan?.name ?? config.minPlanSlug}
          />
        </div>
      </main>
    );
  }

  const { data: records, error } = await supabase
    .from(config.table)
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-full">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader icon={icon} title={config.title} />

        <div className="mb-6">
          <GenericAddForm module={config} />
        </div>

        {error && <ErrorMessage message={`loading ${config.table}: ${error.message}`} />}

        <GenericList module={config} records={(records as ModuleRecord[]) ?? []} />
      </div>
    </main>
  );
}
