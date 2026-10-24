import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LayoutGrid } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { isFeatureOn } from "@/lib/flags/flags";
import { PageHeader } from "@/components/dashboard/page-header";
import { UpgradeRequired } from "@/components/billing/upgrade-required";
import { upgradeWallProps } from "@/lib/billing/feature-catalog";
import { RECORD_CAP } from "@/lib/record-cap";
import { ComingSoonShell } from "@/components/tools/coming-soon-shell";
import { appGate } from "@/lib/apps/app-access";
import { appSystemPrompt } from "@/lib/apps/app-system";
import { AppsShell, type AppRow } from "@/components/apps/apps-shell";
import { readExampleParam } from "@/lib/overview/first-screen-examples";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("dashboard.tools.names.apps");
}

/**
 * APPS (the owner's "APPS: ΛΕΙΤΟΥΡΓΙΚΟ, ΚΟΜΜΑΤΙ ΚΟΜΜΑΤΙ", 2026-10-24),
 * behind the switch "apps-tool".
 *
 * THE SWITCH, NOT `ready`. The All tools tile keeps its «Σύντομα» mark
 * from src/lib/nav/all-tools.ts until every piece passes, and this page
 * does not read that flag: anyone the switch is not open to gets the
 * same Coming Soon screen the tile promised, so a half-built piece is
 * never reachable by a customer. The day every piece is done, `ready`
 * flips and this page is already the real tool for those who have it.
 *
 * Without the Site's plan, the wall that says which plan has it — the
 * routes refuse the same gate (lib/apps/app-access.ts).
 */
export default async function AppBuilderPage(props: { searchParams?: Promise<{ ask?: string }> }) {
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations();

  if (!(await isFeatureOn("apps-tool", user))) {
    return (
      <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
        <ComingSoonShell
          toolKey="apps"
          name={t("dashboard.tools.names.apps")}
          examples={[t("dashboard.comingSoon.examples.apps.a"), t("dashboard.comingSoon.examples.apps.b"), t("dashboard.comingSoon.examples.apps.c")]}
        />
      </div>
    );
  }

  const gate = await appGate(user);
  if (!gate.ok) {
    return (
      <div className="min-h-full">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <PageHeader helpKey="help.apps" icon={LayoutGrid} title={t("dashboard.tools.names.apps")} />
          <UpgradeRequired {...upgradeWallProps("websiteBuilder", t("dashboard.tools.names.apps"))!} />
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("user_apps")
    .select("id, title, definition, status, versions, locale, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(RECORD_CAP);
  return (
    <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
      <AppsShell initialApps={(data as AppRow[] | null) ?? []} systemChars={appSystemPrompt().length} initialText={readExampleParam(searchParams?.ask)} />
    </div>
  );
}
