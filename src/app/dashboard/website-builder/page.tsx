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
import { readExampleParam } from "@/lib/overview/first-screen-examples";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { accountHasCapability } from "@/lib/billing/capability-gate";
import { upgradeWallProps } from "@/lib/billing/feature-catalog";
import { UpgradeRequired } from "@/components/billing/upgrade-required";

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
//
// AND UNTIL 2026-09-13 THAT SENTENCE WAS DOING REAL DAMAGE. "already has
// its own plan gating" is true of the TRACKER and was read as true of
// this page, which had none: `capabilities.websiteBuilder` is false on
// Free, the pricing page and the signup grid both drew a ✕ for it, and a
// Free account could open this page and generate a site. The field was
// read in exactly three places in the product and every one of them was
// drawing a tick.
//
// It survived because the paywall existed one step LATER:
// maxPublishedSitesForPlan is 0 on Free and api/websites/[id]/publish
// does refuse. So a Free account could generate and not publish, and
// anybody who checked casually met a refusal and stopped looking.
//
// The gate is here now, and the same one is in api/websites/generate —
// a page that hides a button is not a paywall.
export default async function WebsiteBuilderPage({
  searchParams,
}: {
  // `brief` is the Home screen's "build" example (see
  // lib/overview/first-screen-examples.ts). A runtime string on both
  // sides — rename it in the link and this page still compiles and still
  // renders, it just stops doing anything — so first-screen.test.mjs
  // compares the two names.
  searchParams: { brief?: string };
}) {
  const t = await getTranslations("dashboard.websiteBuilder");
  const supabase = createClient();

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const isAdmin = isAdminEmail(user.email);
  const planSlug = await resolveEffectivePlanSlug(user);
  if (!accountHasCapability(planSlug, "websiteBuilder", isAdmin)) {
    return (
      <div className="min-h-full bg-dot-grid">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <PageHeader
            helpKey="help.websiteBuilder"
            helpArticle="create-website"
            icon={WEBSITE_BUILDER_ICON}
            title={t("title")}
          />
          <UpgradeRequired {...upgradeWallProps("websiteBuilder", t("title"))!} />
        </div>
      </div>
    );
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
    <div className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader helpKey="help.websiteBuilder" helpArticle="create-website" icon={WEBSITE_BUILDER_ICON} title={t("title")} description={t("description")} />
        <WebsiteBuilderWorkspace
          initialWebsites={websiteRows}
          favoritedWebsiteIds={favoritedWebsiteIds}
          // BUILDING ON ARRIVAL. Clamped rather than trusted: this comes
          // out of a URL anyone can edit.
          initialBrief={readExampleParam(searchParams.brief)}
        />
      </div>
    </div>
  );
}
