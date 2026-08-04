import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { TimelineFilters } from "@/components/timeline/timeline-filters";
import { TimelineList } from "@/components/timeline/timeline-list";
import { LINKABLE_MODULES } from "@/lib/knowledge-graph";
import { TIMELINE_ICON } from "@/lib/module-icons";
import { loadTimelineEntries, TIMELINE_RANGES, type TimelineRange } from "@/lib/timeline";

export const metadata: Metadata = { title: "Timeline" };

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
  searchParams: { module?: string; range?: string };
}) {
  const t = await getTranslations("dashboard.timeline");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const moduleSlug = LINKABLE_MODULES.some((m) => m.slug === searchParams.module)
    ? (searchParams.module as string)
    : "all";
  const range = resolveRange(searchParams.range);

  const entries = await loadTimelineEntries(supabase, user.id, {
    moduleSlug: moduleSlug === "all" ? null : moduleSlug,
    range,
  });

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader icon={TIMELINE_ICON} title={t("title")} />
        <TimelineFilters moduleSlug={moduleSlug} range={range} />
        <TimelineList entries={entries} />
      </div>
    </main>
  );
}
