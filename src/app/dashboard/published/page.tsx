import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Globe } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ErrorMessage } from "@/components/error-message";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { maxPublishedSitesForPlan, MAX_SITE_VERSIONS } from "@/lib/publishing/publish-limits";
import { publishedSiteUrl } from "@/lib/publishing/subdomain";
import { getSiteUrl } from "@/lib/site-url";
import {
  PublishedSitesList,
  type PublishedSiteRow,
  type SiteVersionRow,
} from "@/components/publishing/published-sites-list";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.published");
}

// Every site this account has live, with its traffic and its version
// history.
//
// Four reads, all in parallel and all owner-scoped by RLS. The analytics
// read is a 7-day window rather than a full aggregate: "142 views this
// week" is the number a person acts on, and summing every row a site has
// ever accumulated to show it would get slower every day the site stays
// up.
const ANALYTICS_WINDOW_DAYS = 7;

export default async function PublishedSitesPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("dashboard.publishing");
  const isAdmin = isAdminEmail(user.email);
  const planSlug = await resolveEffectivePlanSlug(user);
  const planCap = maxPublishedSitesForPlan(planSlug);

  const since = new Date(Date.now() - ANALYTICS_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [{ data: sites, error: sitesError }, { data: analytics }] = await Promise.all([
    supabase
      .from("published_sites")
      .select("id, website_id, subdomain, status, view_count, published_at, updated_at")
      .eq("user_id", user.id)
      .order("published_at", { ascending: false }),
    supabase
      .from("site_analytics")
      .select("published_site_id, views")
      .eq("user_id", user.id)
      .gte("date", since),
  ]);

  const siteRows = sites ?? [];
  const siteIds = siteRows.map((s) => s.id);
  const websiteIds = siteRows.map((s) => s.website_id);

  // Two more reads, only when there is something to read them for — an
  // account with no published sites pays for nothing here.
  const [{ data: websites }, { data: versions }] =
    siteIds.length > 0
      ? await Promise.all([
          supabase.from("user_websites").select("id, name").in("id", websiteIds),
          supabase
            .from("site_versions")
            .select("id, published_site_id, version_number, published_at, change_description")
            .in("published_site_id", siteIds)
            .order("version_number", { ascending: false })
            .limit(MAX_SITE_VERSIONS * Math.max(1, siteIds.length)),
        ])
      : [{ data: [] }, { data: [] }];

  const nameById = new Map((websites ?? []).map((w) => [w.id, w.name as string]));
  const weekViews = new Map<string, number>();
  for (const row of analytics ?? []) {
    weekViews.set(row.published_site_id, (weekViews.get(row.published_site_id) ?? 0) + (row.views ?? 0));
  }

  const publishedDomain = process.env.PUBLISHED_SITE_DOMAIN;
  const rows: PublishedSiteRow[] = siteRows.map((site) => ({
    id: site.id,
    website_id: site.website_id,
    subdomain: site.subdomain,
    status: site.status as "live" | "unpublished",
    view_count: site.view_count ?? 0,
    published_at: site.published_at,
    updated_at: site.updated_at,
    // useSortAndPaginate sorts on `created_at`; the meaningful order for a
    // published site is when it went live, so that is what is passed under
    // that name — the same aliasing DocumentsList uses for updated_at.
    created_at: site.published_at,
    url: publishedSiteUrl(site.subdomain, getSiteUrl(), publishedDomain),
    website_name: nameById.get(site.website_id) ?? site.subdomain,
    views_this_week: weekViews.get(site.id) ?? 0,
  }));

  const cap = isAdmin ? Number.POSITIVE_INFINITY : planCap;

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader helpKey="help.published" helpArticle="publish-website" icon={Globe} title={t("title")} description={t("description")} />

        {/* GDPR: what is and is not measured, said plainly on the page that
            shows the numbers rather than buried in a policy. */}
        <p className="mb-4 rounded-xl border border-border bg-panel/60 p-3 text-[11px] leading-relaxed text-muted">
          {t("analyticsNotice")}
        </p>

        {sitesError && <ErrorMessage detail={`loading published sites: ${sitesError.message}`} />}

        <PublishedSitesList
          sites={rows}
          versions={(versions ?? []) as SiteVersionRow[]}
          cap={cap}
        />
      </div>
    </main>
  );
}
