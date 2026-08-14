import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { sidebarKeyForSlug } from "@/lib/favoritable";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ErrorMessage } from "@/components/error-message";
import { GenericList } from "@/components/modules/generic-list";
import { UpgradeRequired } from "@/components/billing/upgrade-required";
import type { ModuleConfig } from "@/lib/modules";
import type { ModuleRecord } from "@/types/module-record";
import { loadLinkedEntities } from "@/lib/entity-links";
import { loadFavoriteIds } from "@/lib/favorites";
import { getPlan, planMeetsMinimum } from "@/lib/billing/plans";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
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
  // `config.title` is the author's English name — "AI Coding", "Marketing
  // Campaigns". Printed as the page's <h1> it put an English heading at the
  // top of a Greek page on all seven Build modules. The sidebar has always
  // had the reader's name for them.
  const moduleLabel = (await getTranslations("sidebar.items"))(sidebarKeyForSlug(config.slug));
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const isAdmin = isAdminEmail(user.email);
  const planSlug = await resolveEffectivePlanSlug(user);

  if (!isAdmin && config.minPlanSlug && !planMeetsMinimum(planSlug, config.minPlanSlug)) {
    const requiredPlan = getPlan(config.minPlanSlug);
    return (
      <main className="min-h-full bg-dot-grid">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <PageHeader icon={icon} title={moduleLabel} />
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

  const recordIds = (records as ModuleRecord[] | null)?.map((r) => r.id) ?? [];
  const [linkedEntities, favoritedIds] = await Promise.all([
    loadLinkedEntities(supabase, user.id, config.table, recordIds),
    loadFavoriteIds(supabase, user.id, config.table, recordIds),
  ]);

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader icon={icon} title={moduleLabel} />


        {error && <ErrorMessage detail={`loading ${config.table}: ${error.message}`} />}

        <GenericList
          module={config}
          records={(records as ModuleRecord[]) ?? []}
          linkedEntities={linkedEntities}
          favoritedIds={favoritedIds}
        />
      </div>
    </main>
  );
}
