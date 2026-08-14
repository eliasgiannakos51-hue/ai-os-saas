"use client";

import { useMemo, useState } from "react";
import { Plus, Rocket, SearchX, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { SortToggle } from "@/components/sort-toggle";
import { ListLayout } from "@/components/ui/list-layout";
import { CardGrid } from "@/components/ui/entity-card";
import { MissionCard } from "@/components/mission/mission-card";
import { MissionDetail, type MissionDetailTab } from "@/components/mission/mission-detail";
import { MissionForm } from "@/components/mission/mission-form";
import { useSortAndPaginate } from "@/lib/use-sort-and-paginate";
import { isActiveMission } from "@/lib/mission-progress";
import type { Mission, MissionStatus } from "@/types/mission";
import { matchesSearch } from "@/lib/text/search-match";

const MISSION_STATUSES: MissionStatus[] = ["planning", "in_progress", "completed", "failed"];

const STATUS_LABEL_KEYS: Record<MissionStatus, string> = {
  planning: "statusPlanning",
  in_progress: "statusInProgress",
  completed: "statusCompleted",
  failed: "statusFailed",
};

export function MissionList({
  missions,
  scheduledStepIndicesByMission = {},
  favoritedIds = [],
  energyLevel = null,
}: {
  missions: Mission[];
  // Keyed by mission id — see dashboard/mission/page.tsx, passed straight
  // through to the detail panel so it can show "Scheduled" instead of the
  // schedule button for a step that already has one pending.
  scheduledStepIndicesByMission?: Record<string, number[]>;
  /** Mission ids the user has starred — one batched query on the page,
   *  not a fetch per card. */
  favoritedIds?: string[];
  /** Latest energy check-in (1-5), resolved server-side on the page. */
  energyLevel?: number | null;
}) {
  const t = useTranslations("dashboard.mission");
  const tModule = useTranslations("module");
  const tCommon = useTranslations("common");
  const [showForm, setShowForm] = useState(missions.length === 0);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<{ id: string; tab: MissionDetailTab } | null>(null);
  const favoritedSet = useMemo(() => new Set(favoritedIds), [favoritedIds]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return missions.filter((mission) => {
      if (statusFilter && mission.status !== statusFilter) return false;
      if (!q) return true;
      const steps = (mission.plan_steps?.steps ?? []).map((s) => s.text).join(" ");
      return matchesSearch(`${mission.goal} ${steps}`, q);
    });
  }, [missions, query, statusFilter]);

  // Active missions (planning/in_progress) surface first regardless of
  // age, so a user with many finished missions doesn't have to scroll
  // past all of them to find what's still in progress — stable within
  // each group (the shared hook keeps the sort order inside each half).
  const ordered = useMemo(() => {
    const active = filtered.filter(isActiveMission);
    const finished = filtered.filter((m) => !isActiveMission(m));
    return [...active, ...finished];
  }, [filtered]);

  const { sortOrder, setSortOrder, page, setPage, totalPages, paginated, alphabetical } =
    useSortAndPaginate(ordered, `${query}|${statusFilter}`, (m) => m.goal);

  const selectedMission = selected ? missions.find((m) => m.id === selected.id) ?? null : null;

  return (
    <div className="space-y-6">
      {selectedMission && (
        <MissionDetail
          key={selectedMission.id}
          mission={selectedMission}
          scheduledStepIndices={scheduledStepIndicesByMission[selectedMission.id] ?? []}
          initialFavorited={favoritedSet.has(selectedMission.id)}
          initialTab={selected?.tab ?? "steps"}
          energyLevel={energyLevel}
          onClose={() => setSelected(null)}
        />
      )}

      <ListLayout
        newAction={
          showForm ? (
            <div className="panel-pop-in relative">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                aria-label={tCommon("cancel")}
                title={tCommon("cancel")}
                className="absolute right-3 top-3 z-[2] flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
              <MissionForm onCreated={() => setShowForm(false)} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)]"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> {t("newMission")}
            </button>
          )
        }
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder={tModule("searchPlaceholder")}
        filters={
          <>
            <SortToggle sortOrder={sortOrder} onChange={setSortOrder} alphabetical={alphabetical} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label={tModule("filterBy", { label: t("statusFilterLabel") })}
              className="min-h-[44px] rounded-full border border-border bg-input px-3 py-1.5 text-xs text-foreground outline-none transition-colors duration-150 focus:border-orange-500/60"
            >
              <option value="">{tModule("filterAll", { label: t("statusFilterLabel") })}</option>
              {MISSION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(STATUS_LABEL_KEYS[status])}
                </option>
              ))}
            </select>
          </>
        }
        meta={
          <span className="text-xs text-muted">
            {tModule("resultCount", { count: filtered.length, total: missions.length })}
          </span>
        }
      >
        {missions.length === 0 ? (
          <EmptyState icon={Rocket}>{t("emptyState")}</EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState icon={SearchX}>{tModule("noMatches", { query })}</EmptyState>
        ) : (
          <>
            <CardGrid>
              {paginated.map((mission, i) => (
                <MissionCard
                  key={mission.id}
                  mission={mission}
                  index={i}
                  selected={selected?.id === mission.id}
                  initialFavorited={favoritedSet.has(mission.id)}
                  onOpen={(tab) => setSelected({ id: mission.id, tab: tab ?? "steps" })}
                />
              ))}
            </CardGrid>
            <PaginationControls page={page} totalPages={totalPages} onChange={setPage} />
          </>
        )}
      </ListLayout>
    </div>
  );
}
