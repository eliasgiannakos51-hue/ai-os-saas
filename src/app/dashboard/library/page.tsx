import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { FAVORITES_ICON } from "@/lib/module-icons";
import { FavoritesList } from "@/components/favorites/favorites-list";
import { groupFavorites, loadAllFavorites, loadFavoriteKeys } from "@/lib/favorites";
import { TimelineList } from "@/components/timeline/timeline-list";
import { loadTimelineEntries } from "@/lib/timeline";
import { LibrarySearch } from "@/components/library/library-search";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.library");
}

// Reads live, frequently-changing data — favourites are toggled from
// every module — so it must never serve a cached result. Same reasoning
// as the two pages it absorbs.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const TABS = ["recent", "starred", "search"] as const;
type Tab = (typeof TABS)[number];

/**
 * THREE DOORS INTO YOUR OWN DATA, WHICH IS TWO TOO MANY.
 *
 * Starred things were /dashboard/favorites. Everything in order was
 * /dashboard/timeline. Searching what you had written was Ctrl+K — a
 * shortcut a person has to already know about, and cannot press on a
 * phone at all. Three sidebar rows (two of them, plus a keystroke) for
 * one question: "where is the thing I put in here?"
 *
 * ONE TAB'S DATA PER VISIT. The tabs are links, not client state, so
 * arriving on Starred does not also load a timeline nobody asked for.
 * The old routes still work; this is a front door, not a demolition.
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("dashboard.library");
  const supabase = createClient();
  const tab: Tab = TABS.includes(searchParams.tab as Tab) ? (searchParams.tab as Tab) : "recent";

  const favorites = tab === "starred" ? await loadAllFavorites(supabase, user.id) : [];
  const timeline =
    tab === "recent"
      ? await loadTimelineEntries(supabase, user.id, { moduleSlug: null, range: "month" })
      : null;
  // One query per distinct table on the page, not one per entry — the
  // same batching /dashboard/timeline does.
  const favoritedKeys = timeline
    ? await loadFavoriteKeys(
        supabase,
        user.id,
        timeline.entries.map((e) => ({ table: e.table, id: e.id })),
      )
    : undefined;

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader helpKey="help.library" icon={FAVORITES_ICON} title={t("title")} description={t("description")} />

        <div role="tablist" aria-label={t("title")} className="mb-4 flex flex-wrap gap-2">
          {TABS.map((name) => (
            <Link
              key={name}
              href={`/dashboard/library?tab=${name}`}
              role="tab"
              aria-selected={tab === name}
              data-testid={`library-tab-${name}`}
              className={`inline-flex min-h-[44px] items-center rounded-xl border px-3 py-1.5 text-sm transition-colors duration-150 ${
                tab === name
                  ? "border-orange-500/60 bg-orange-500/10 font-medium text-orange-300"
                  : "border-border text-muted hover:border-orange-500/40 hover:text-foreground"
              }`}
            >
              {t(`tabs.${name}`)}
            </Link>
          ))}
        </div>

        {tab === "recent" && timeline && (
          <TimelineList entries={timeline.entries} favoritedKeys={favoritedKeys} />
        )}
        {tab === "starred" && <FavoritesList groups={groupFavorites(favorites)} />}
        {tab === "search" && <LibrarySearch />}
      </div>
    </main>
  );
}
