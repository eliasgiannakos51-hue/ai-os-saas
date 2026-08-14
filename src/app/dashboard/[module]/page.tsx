import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ErrorMessage } from "@/components/error-message";
import { GenericList } from "@/components/modules/generic-list";
import { getModule } from "@/lib/modules";
import { MODULE_ICONS } from "@/lib/module-icons";
import type { ModuleRecord } from "@/types/module-record";
import { loadLinkedEntities } from "@/lib/entity-links";
import { loadFavoriteIds } from "@/lib/favorites";
import { AutomationRealizeList } from "@/components/automation/automation-realize-list";
import { AutomationActiveList } from "@/components/automation/automation-active-list";
import type { UserAutomation } from "@/types/user-automation";

export function generateMetadata({
  params,
}: {
  params: { module: string };
}): Metadata {
  const moduleConfig = getModule(params.module);
  return { title: moduleConfig?.title ?? "Not Found" };
}

export default async function ModulePage({
  params,
}: {
  params: { module: string };
}) {
  const moduleConfig = getModule(params.module);

  if (!moduleConfig) {
    notFound();
  }

  // Same fix as the tracking pages: the heading is the translated name,
  // read from the sidebar's own key so the two can never disagree.
  const tNav = await getTranslations("sidebar.items");
  const title = moduleConfig.titleKey ? tNav(moduleConfig.titleKey) : moduleConfig.title;

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: records, error } = await supabase
    .from(moduleConfig.table)
    .select("*")
    .order("created_at", { ascending: false });

  const recordIds = (records as ModuleRecord[] | null)?.map((r) => r.id) ?? [];
  const [linkedEntities, favoritedIds] = await Promise.all([
    loadLinkedEntities(supabase, user.id, moduleConfig.table, recordIds),
    loadFavoriteIds(supabase, user.id, moduleConfig.table, recordIds),
  ]);

  // Real Automations — only the "automation" module gets these two extra
  // sections (Active Automations + "Make this real"), built on top of the
  // shared GenericList rather than inside it, so the other 12 modules are
  // untouched.
  const isAutomationModule = moduleConfig.slug === "automation";
  let userAutomations: UserAutomation[] = [];
  if (isAutomationModule) {
    const { data: automationRows } = await supabase
      .from("user_automations")
      .select("*")
      .order("created_at", { ascending: false });
    userAutomations = (automationRows as UserAutomation[] | null) ?? [];
  }

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader icon={MODULE_ICONS[moduleConfig.slug]} title={title} />


        {error && (
          <ErrorMessage message={`loading ${moduleConfig.table}: ${error.message}`} />
        )}

        {isAutomationModule && <AutomationActiveList automations={userAutomations} />}
        {isAutomationModule && <AutomationRealizeList records={(records as ModuleRecord[]) ?? []} />}

        <GenericList
          module={moduleConfig}
          records={(records as ModuleRecord[]) ?? []}
          linkedEntities={linkedEntities}
          favoritedIds={favoritedIds}
        />
      </div>
    </main>
  );
}
