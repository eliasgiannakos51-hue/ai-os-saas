import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LayoutGrid } from "lucide-react";
import { pageTitle } from "@/lib/page-title";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { PageHeader } from "@/components/dashboard/page-header";
import { ToolsGrid } from "@/components/tools/tools-grid";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.rail.allTools");
}

/**
 * ALL TOOLS — the third road to every tool, and the only one a person can
 * browse without knowing a name (docs/mockups/README.md, "Three roads to
 * every tool"). Since ΣΥΣΤΗΜΑ DESIGN (docs/CONTEXT.md, 2026-10-04) it is
 * small tiles with a search on top — components/tools/tools-grid.tsx,
 * which reads lib/sidebar-nav.ts through the same sidebarGroups() and
 * owner filter, the tools first and the Settings block last
 * (scripts/tests/sidebar-structure.test.mjs §3). The rail beside it
 * (components/dashboard/sidebar.tsx) is New, Chat, Coding, All tools,
 * Recent tools and Settings.
 */
export default async function ToolsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("dashboard.tools");
  const isOwner = isAdminEmail(user.email);

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <PageHeader helpKey="help.tools" icon={LayoutGrid} title={t("title")} description={t("description")} />
        <div className="mt-4">
          <ToolsGrid isOwner={isOwner} />
        </div>
        <p className="mt-6 text-xs text-muted">{t("orPress")}</p>
      </div>
    </div>
  );
}
