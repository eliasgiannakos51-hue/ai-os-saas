import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/dashboard/page-header";
import { MODULE_ICONS } from "@/lib/module-icons";
import { RecordsHub } from "@/components/records/records-hub";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.records");
}

/**
 * One page for the nineteen log screens the sidebar used to list one by
 * one. Their own routes are unchanged — this is a way in, not a
 * replacement, and nothing was made unreachable to shorten a menu.
 */
export default async function RecordsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("dashboard.records");

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader
          helpKey="help.records"
          icon={MODULE_ICONS.ideas}
          title={t("title")}
          description={t("description")}
        />
        <RecordsHub />
      </div>
    </main>
  );
}
