import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ComingSoonShell } from "@/components/tools/coming-soon-shell";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("dashboard.tools.names.translate");
}

/**
 * TRANSLATE — not a tool of its own yet (src/lib/nav/all-tools.ts,
 * `ready: false`): today it is only the Translate button embedded inside
 * Documents (components/documents/documents-shell.tsx) and the Site
 * builder (dashboard/website-builder/page.tsx), both behind the
 * `translate` switch. This is the screen the All tools tile opens instead
 * (components/tools/coming-soon-shell.tsx) — no field, no provider call,
 * no charge. Delete this file's body and render the real standalone tool
 * here the day it is built; nothing else reads `ready`, so that one
 * change is what makes the tile live.
 */
export default async function TranslatePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
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
