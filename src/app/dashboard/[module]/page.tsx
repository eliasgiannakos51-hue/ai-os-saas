import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ErrorMessage } from "@/components/error-message";
import { GenericList } from "@/components/modules/generic-list";
import { FinanceQuickEntry } from "@/components/finance/finance-quick-entry";
import { SalesStages, type StagedLead } from "@/components/sales/sales-stages";
import { getModule } from "@/lib/modules";
import { RECORD_CAP } from "@/lib/record-cap";
import { MODULE_ICONS } from "@/lib/module-icons";
import type { ModuleRecord } from "@/types/module-record";
import { loadLinkedEntities } from "@/lib/entity-links";
import { loadFavoriteIds } from "@/lib/favorites";
import { AutomationRealizeList } from "@/components/automation/automation-realize-list";
import { AutomationActiveList } from "@/components/automation/automation-active-list";
import type { UserAutomation } from "@/types/user-automation";
import { isFeatureOn } from "@/lib/flags/flags";
import { AutomationShell } from "@/components/automations/automation-shell";
import { loadAutomationPage } from "@/lib/automations/page-data";

// The 12 business modules share this one route, so they shared one
// COUNT: 12 /^ {4}slug: "/ in src/lib/modules.ts
// English title too: `moduleConfig.title` is the author's string, not the
// reader's. `titleKey` is the config's own `sidebar.items.*` key — the
// same one the sidebar link and the favorites grouping read — so
// /dashboard/finance puts the same word in the tab as in the nav that got
// you there, and a renamed module cannot leave the tab behind.
export async function generateMetadata(
  props: {
    params: Promise<{ module: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;
  const moduleConfig = getModule(params.module);
  if (!moduleConfig) return pageTitle("pageTitle.notFound");
  return pageTitle(moduleConfig.titleKey);
}

export default async function ModulePage(
  props: {
    params: Promise<{ module: string }>;
    searchParams: Promise<{ run?: string }>;
  }
) {
  const params = await props.params;
  const moduleConfig = getModule(params.module);

  if (!moduleConfig) {
    notFound();
  }

  const t = await getTranslations();
  const supabase = await createClient();

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // AUTOMATIONS AS BOXES (MASTER 16, package 30), behind the switch
  // "automations": the tool in the shell, INSTEAD of the list below.
  // Everybody the switch is off for keeps the page they always had, and
  // the one-sentence automations keep running for everybody — the shell
  // shows them too, as they were.
  const isAutomationModule = moduleConfig.slug === "automation";
  if ((await isFeatureOn("automations", user)) && isAutomationModule) {
    const searchParams = await props.searchParams;
    const data = await loadAutomationPage(user, searchParams.run);
    return (
      <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
        <AutomationShell
          initialFlows={data.flows}
          initialRuns={data.runs}
          initialOpenId={data.openId}
          initialRunId={data.runId}
          prices={data.prices}
          configured={Boolean(process.env.ANTHROPIC_API_KEY)}
          connected={data.connected}
          older={data.older}
        />
      </div>
    );
  }

  // CAPPED, AND THE PAGE SAYS SO. This read every row the account had
  // ever created, with every column, on every visit — and then paginated
  // in the browser, so the controls at the bottom never saved a byte.
  // See lib/record-cap.ts for why the number is high rather than small.
  const { data: records, error } = await supabase
    .from(moduleConfig.table)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(RECORD_CAP);

  const recordIds = (records as ModuleRecord[] | null)?.map((r) => r.id) ?? [];
  const [linkedEntities, favoritedIds] = await Promise.all([
    loadLinkedEntities(supabase, user.id, moduleConfig.table, recordIds),
    loadFavoriteIds(supabase, user.id, moduleConfig.table, recordIds),
  ]);

  // Real Automations — only the "automation" module gets these two extra
  // sections (Active Automations + "Make this real"), built on top of the
  // shared GenericList rather than inside it, so the other 12 modules are
  // untouched.
  let userAutomations: UserAutomation[] = [];
  if (isAutomationModule) {
    const { data: automationRows } = await supabase
      .from("user_automations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(RECORD_CAP);
    userAutomations = (automationRows as UserAutomation[] | null) ?? [];
  }

  // FINANCES AND SALES (MASTER 16, package 18), behind the switch
  // "finance-sales": a sentence that becomes an entry above the finance
  // list, and every contact's stage with its reminder above the leads.
  const financeSales =
    (moduleConfig.slug === "finance" || moduleConfig.slug === "sales") && (await isFeatureOn("finance-sales", user));

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader
          icon={MODULE_ICONS[moduleConfig.slug]}
          title={t(moduleConfig.titleKey)}
          helpKey="help.businessModule"
        />


        {error && (
          <ErrorMessage detail={`loading ${moduleConfig.table}: ${error.message}`} />
        )}

        {isAutomationModule && <AutomationActiveList automations={userAutomations} />}
        {isAutomationModule && <AutomationRealizeList records={(records as ModuleRecord[]) ?? []} />}
        {financeSales && moduleConfig.slug === "finance" ? <FinanceQuickEntry /> : null}
        {financeSales && moduleConfig.slug === "sales" ? (
          <SalesStages
            leads={((records as ModuleRecord[] | null) ?? []).map((r) => ({
              id: String(r.id),
              lead_name: String((r as Record<string, unknown>).lead_name ?? ""),
              stage: ((r as Record<string, unknown>).stage as string | null) ?? null,
              remind_at: ((r as Record<string, unknown>).remind_at as string | null) ?? null,
            })) satisfies StagedLead[]}
          />
        ) : null}

        <GenericList
          module={moduleConfig}
          cap={RECORD_CAP}
          records={(records as ModuleRecord[]) ?? []}
          linkedEntities={linkedEntities}
          favoritedIds={favoritedIds}
        />
      </div>
    </div>
  );
}
