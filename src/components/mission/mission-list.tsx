"use client";

import { useMemo, useState } from "react";
import { Rocket } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { MissionCard } from "@/components/mission/mission-card";
import { isActiveMission } from "@/lib/mission-progress";
import type { Mission } from "@/types/mission";

// Missions are much larger/heavier than a plain record row (full step
// list, agent-role pickers, review text), so a smaller page size than the
// generic 20-per-page (lib/use-sort-and-paginate.ts) keeps the page
// actually readable once a user has more than a handful of missions —
// without this, dashboard/mission/page.tsx's unbounded "select every
// mission ever created" query renders every one of them, fully expanded,
// on a single ever-growing page.
const MISSIONS_PER_PAGE = 5;

export function MissionList({
  missions,
  scheduledStepIndicesByMission = {},
  favoritedIds = [],
}: {
  missions: Mission[];
  // Keyed by mission id — see dashboard/mission/page.tsx, passed straight
  // through to each MissionCard so it can show "Scheduled" instead of the
  // schedule button for a step that already has one pending.
  scheduledStepIndicesByMission?: Record<string, number[]>;
  /** Mission ids the user has starred — one batched query on the page,
   *  not a fetch per card. */
  favoritedIds?: string[];
}) {
  const t = useTranslations("dashboard.mission");
  const [page, setPage] = useState(1);
  const favoritedSet = useMemo(() => new Set(favoritedIds), [favoritedIds]);

  // Active missions (planning/in_progress) surface first regardless of
  // age, so a user with many finished missions doesn't have to scroll
  // past all of them to find what's still in progress — stable within
  // each group (server already orders by created_at desc).
  const ordered = useMemo(() => {
    const active = missions.filter(isActiveMission);
    const finished = missions.filter((m) => !isActiveMission(m));
    return [...active, ...finished];
  }, [missions]);

  const totalPages = Math.max(1, Math.ceil(ordered.length / MISSIONS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const paginated = ordered.slice(
    (currentPage - 1) * MISSIONS_PER_PAGE,
    currentPage * MISSIONS_PER_PAGE
  );

  if (missions.length === 0) {
    return <EmptyState icon={Rocket}>{t("emptyState")}</EmptyState>;
  }

  return (
    <div>
      <div className="space-y-4">
        {paginated.map((mission) => (
          <MissionCard
            key={mission.id}
            mission={mission}
            scheduledStepIndices={scheduledStepIndicesByMission[mission.id] ?? []}
            initialFavorited={favoritedSet.has(mission.id)}
          />
        ))}
      </div>
      <PaginationControls page={currentPage} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
