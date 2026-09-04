import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUserResult } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { TimelineTabs } from "@/components/timeline/timeline-tabs";
import { FavoritesList } from "@/components/favorites/favorites-list";
import { FAVORITES_ICON } from "@/lib/module-icons";
import { groupFavorites, loadAllFavorites } from "@/lib/favorites";

// THE STARRED LIST, AT ITS OWN ADDRESS — V4.6, round 5.
//
// This route spent V4.6 as a redirect to /dashboard/timeline?view=fav,
// and the star in the timeline's own tab row pointed at that query string
// too. So the page a person had bookmarked, the row in the command
// palette and the star they clicked all arrived somewhere else, and the
// address bar never said "favorites". The owner asked for the star to
// land here instead, which makes this the canonical starred page and the
// query string the alias rather than the other way round.
//
// It renders exactly what the starred tab rendered: the SAME
// loadAllFavorites query and the SAME FavoritesList, so nothing about the
// list changes — only its address. The starred view has always read
// user_favorites rather than filtering the timeline (see
// components/timeline/timeline-tabs.tsx: the timeline keeps the newest
// 200 rows and does not scan chats, sites, missions or documents at all),
// which is why this is a page with its own query and not a filter.
//
// /dashboard/timeline?view=fav still works — it is in people's history —
// and still renders the same thing from the timeline page.
export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.favorites");
}

// Same reason as the timeline page: this reads live rows on every load.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function FavoritesPage() {
  const t = await getTranslations("dashboard.timeline");
  const tSidebar = await getTranslations("sidebar");
  const supabase = createClient();
  const { user } = await getCurrentUserResult();
  if (!user) redirect("/login");

  const favorites = await loadAllFavorites(supabase, user.id);

  return (
    <div className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {/* The starred tip, not the timeline one: "starring does not copy
            or move anything" is the thing a person needs told here. */}
        {/* THE PAGE IS CALLED WHAT THE ROW IS CALLED. The starred view
            used to render under the timeline's own title, so the row said
            "Favorites" and the page said "Mine" —
            scripts/tests/sidebar-naming.test.mjs fails on exactly that,
            in all ten languages. */}
        <PageHeader helpKey="help.favorites" icon={FAVORITES_ICON} title={tSidebar("items.favorites")} />
        <TimelineTabs view="fav" />
        <FavoritesList groups={groupFavorites(favorites)} />
      </div>
    </div>
  );
}
