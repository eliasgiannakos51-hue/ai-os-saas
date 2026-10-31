import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isFeatureOn } from "@/lib/flags/flags";
import { ComingSoonShell } from "@/components/tools/coming-soon-shell";
import { TranslateShell } from "@/components/translate/translate-shell";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("dashboard.tools.names.translate");
}

/**
 * TRANSLATE, AS ITS OWN TOOL (the owner's "ΛΕΙΤΟΥΡΓΙΚΟ, ΚΟΜΜΑΤΙ ΚΟΜΜΑΤΙ",
 * 2026-10-24), built piece by piece behind the switch "translate-tool" —
 * `DEFAULT_AUDIENCE` ("staff", src/lib/flags/flags.ts) until the owner
 * widens it on /dashboard/system-health.
 *
 * THIS CHECK IS DELIBERATELY SEPARATE FROM `ready` in
 * src/lib/nav/all-tools.ts. `ready` only decides the All tools tile's own
 * «Σύντομα» badge — it says nothing about who may reach the address
 * directly, and a tile flipped live before every piece is checked would
 * otherwise be reachable by a customer the moment someone presses it.
 * Until the flag is open to everyone, anyone it is not open to — the
 * tile's badge notwithstanding — sees exactly the same Coming Soon screen
 * as before.
 */
export default async function TranslatePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (await isFeatureOn("translate-tool", user)) {
    return (
      <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
        <TranslateShell />
      </div>
    );
  }
  const t = await getTranslations();
  return (
    <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
      <ComingSoonShell
        toolKey="translate"
        name={t("dashboard.tools.names.translate")}
        examples={[t("dashboard.comingSoon.examples.translate.a"), t("dashboard.comingSoon.examples.translate.b")]}
      />
    </div>
  );
}
