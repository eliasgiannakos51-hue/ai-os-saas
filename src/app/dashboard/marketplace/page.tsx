import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { MARKETPLACE_ICON } from "@/lib/module-icons";
import {
  TemplateBrowser,
  type BrowsableTemplate,
} from "@/components/marketplace/template-browser";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.marketplace");
}

export const dynamic = "force-dynamic";

/**
 * THE LIBRARY THAT WAS ALREADY THERE.
 *
 * This page used to be an honest empty state with a disabled "Publish a
 * Template" button, written when there was no table behind it. There has
 * been one since the 20260826 migration — agent_templates, with curated
 * built-ins and anything users have shared from the Agents screen — plus
 * routes to share and to adopt. What was missing was the only part a person
 * could use: somewhere to LOOK. A template nobody happened to describe in
 * the right words on the create screen was invisible, however good it was.
 *
 * It is still not a shop, and the copy no longer promises one. Nothing is
 * bought or sold here; the templates are free and the page says what it is.
 *
 * READ UNDER THE USER'S OWN SESSION. agent_templates_select_all grants
 * select to any signed-in user, so RLS is what decides this, not a filter
 * written here that could be forgotten.
 */
export default async function MarketplacePage() {
  const t = await getTranslations("dashboard.marketplace");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("agent_templates")
    .select(
      "slug, title, description, task_pattern, schedule_cron, depth, output_format, keywords, use_count, shared_by",
    )
    // MOST USED FIRST, and `created_at` only to break ties — otherwise the
    // order of two never-used templates changes between page loads, which
    // reads as the list shuffling itself.
    .order("use_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  const templates: BrowsableTemplate[] = (data ?? []).map((row) => ({
    slug: String(row.slug ?? ""),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    taskPattern: String(row.task_pattern ?? ""),
    scheduleCron: String(row.schedule_cron ?? ""),
    depth: String(row.depth ?? "standard"),
    outputFormat: String(row.output_format ?? "summary"),
    keywords: Array.isArray(row.keywords) ? row.keywords.map(String) : [],
    useCount: Number(row.use_count ?? 0),
    curated: row.shared_by === null,
    mine: row.shared_by === user.id,
  }));

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader
          helpKey="help.marketplace"
          icon={MARKETPLACE_ICON}
          title={t("title")}
          description={t("description")}
        />
        {/* A READ THAT FAILED IS NOT AN EMPTY LIBRARY. Supabase returns an
            empty array for a denied policy as readily as for no rows, so a
            silent fallback would show "nothing here yet" to somebody whose
            request was refused. */}
        {error ? (
          <p className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-400">
            {t("loadError")}
          </p>
        ) : (
          <TemplateBrowser templates={templates} />
        )}
      </div>
    </main>
  );
}
