import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { WebsiteBuilderWorkspace } from "@/components/website-builder/website-builder-workspace";
import { WEBSITE_BUILDER_ICON } from "@/lib/module-icons";
import { loadFavoriteIds } from "@/lib/favorites";
import type { UserWebsite } from "@/types/user-website";
import { RECORD_CAP } from "@/lib/record-cap";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.websiteBuilder");
}

// Real AI website generation (Claude produces a complete, standalone HTML
// document — see lib/website-builder.ts), stored in user_websites. This is
// deliberately a separate route/table from the existing "Websites" Build
// module (/dashboard/websites, ai_websites table, lib/build-modules.ts) —
// that module is a plain idea/status CRUD tracker with no AI call and
// already has its own credit cost + plan gating; this page doesn't touch
// it at all.
export default async function WebsiteBuilderPage() {
  const t = await getTranslations("dashboard.websiteBuilder");
  const supabase = createClient();

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const { data: websites } = await supabase
    .from("user_websites")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(RECORD_CAP);

  const websiteRows = (websites as UserWebsite[] | null) ?? [];
  const favoritedWebsiteIds = [
    ...(await loadFavoriteIds(supabase, user.id, "user_websites", websiteRows.map((w) => w.id))),
  ];

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader helpKey="help.websiteBuilder" helpArticle="create-website" icon={WEBSITE_BUILDER_ICON} title={t("title")} description={t("description")} />
        <WebsiteBuilderWorkspace
          initialWebsites={websiteRows}
          favoritedWebsiteIds={favoritedWebsiteIds}
        />
      </div>
    </main>
  );
}
