import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { diagLog } from "@/lib/diag";
import { ErrorMessage } from "@/components/error-message";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUserResult } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { TimelineFilters } from "@/components/timeline/timeline-filters";
import { TimelineTabs } from "@/components/timeline/timeline-tabs";
import { TimelineList } from "@/components/timeline/timeline-list";
import { LINKABLE_MODULES } from "@/lib/knowledge-graph";
import { TIMELINE_ICON } from "@/lib/module-icons";
import { loadTimelineEntries, TIMELINE_RANGES, type TimelineRange } from "@/lib/timeline";
import { loadFavoriteKeys } from "@/lib/favorites";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.mine");
}

// See dashboard/mission/page.tsx for why this is explicit — this page
// merges live data from every linkable module's table on every load.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function resolveRange(value: string | undefined): TimelineRange {
  return (TIMELINE_RANGES as string[]).includes(value ?? "") ? (value as TimelineRange) : "all";
}

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: { module?: string; range?: string; view?: string };
}) {
  const t = await getTranslations("dashboard.timeline");
  const tMission = await getTranslations("dashboard.mission");
  const supabase = createClient();

  // TEMPORARY diagnostic logging — see dashboard/mission/page.tsx for why
  // (same "disappears after refresh" investigation, same query shape).
  const reqId = Math.random().toString(36).slice(2, 8);
  diagLog(`[timeline-diag ${reqId}] request start at ${new Date().toISOString()}`);

  const { user, error: userError } = await getCurrentUserResult();

  diagLog(`[timeline-diag ${reqId}] auth.getUser() -> user=${user?.id ?? "null"} error=${userError?.message ?? "none"}`);

  if (!user) {
    diagLog(`[timeline-diag ${reqId}] no user, redirecting to /login`);
    redirect("/login");
  }

  // THE STARRED VIEW READS user_favorites, NOT A FILTERED TIMELINE.
  //
  // loadTimelineEntries scans 60 rows per module and keeps the newest
  // 200, so post-filtering it to the starred ones would quietly return
  // fewer favorites than the account has — and favorites also cover
  // chats, published sites, missions and documents, which the timeline
  // does not scan at all. Same reason the two used to be separate pages;
  // merging the NAVIGATION is not a licence to merge the QUERIES.
  // THE STARRED VIEW LIVES AT ITS OWN ADDRESS since 2026-09-04.
  //
  // It used to be rendered here, behind ?view=fav, while
  // /dashboard/favorites redirected in — so the page people had
  // bookmarked bounced, the star in the tab row below pointed at a query
  // string, and the address bar never said "favorites". That is reversed:
  // dashboard/favorites/page.tsx draws it, from the SAME loadAllFavorites
  // query, and this redirect keeps every link that already exists working.
  //
  // One implementation, not two. Rendering it in both places is how the
  // two would drift.
  if (searchParams.view === "fav") redirect("/dashboard/favorites");

  const moduleSlug = LINKABLE_MODULES.some((m) => m.slug === searchParams.module)
    ? (searchParams.module as string)
    : "all";
  const range = resolveRange(searchParams.range);

  const { entries, failedTables } = await loadTimelineEntries(supabase, user.id, {
    moduleSlug: moduleSlug === "all" ? null : moduleSlug,
    range,
  });

  // Every module table failing at once is not "no entries" — it is a lost
  // session. One table failing is a real per-table problem and stays
  // tolerated, exactly as before.
  const sessionDegraded = failedTables.length > 0 && entries.length === 0;

  diagLog(`[timeline-diag ${reqId}] loadTimelineEntries -> entries=${entries.length} moduleSlug=${moduleSlug} range=${range} failedTables=${
      failedTables.length === 0 ? "none" : failedTables.join(",")
    } sessionDegraded=${sessionDegraded}`);

  // One query per distinct table on the page, not one per entry.
  const favoritedKeys = await loadFavoriteKeys(
    supabase,
    user.id,
    entries.map((e) => ({ table: e.table, id: e.id }))
  );

  diagLog(`[timeline-diag ${reqId}] render -> entriesPassedToComponent=${entries.length}`);

  return (
    <div className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader helpKey="help.timeline" icon={TIMELINE_ICON} title={t("title")} />
        <TimelineTabs view="all" />
        <TimelineFilters moduleSlug={moduleSlug} range={range} />
        {sessionDegraded ? (
          <ErrorMessage message={tMission("sessionExpired")} />
        ) : (
          <TimelineList entries={entries} favoritedKeys={favoritedKeys} />
        )}
      </div>
    </div>
  );
}
