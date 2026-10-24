import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ComingSoonShell } from "@/components/tools/coming-soon-shell";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("dashboard.tools.names.apps");
}

/**
 * APPS — not built yet (src/lib/nav/all-tools.ts, `ready: false`): the
 * final All tools grid shows its tile anyway, with a «Σύντομα» mark, and
 * this is the screen pressing it opens (components/tools/coming-soon-shell.tsx).
 * No field, no provider call, no charge. Delete this file's body and
 * render the real tool here the day it works end to end — nothing else
 * reads `ready`, so that one change is what makes the tile live.
 */
export default async function AppBuilderPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations();
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
