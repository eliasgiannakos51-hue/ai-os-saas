"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Battery } from "lucide-react";
import type { MissionStep } from "@/types/mission";
import {
  suggestStepForEnergy,
  type EnergyLevel,
} from "@/lib/energy-scheduling";

/**
 * What to pick up right now, given how the day is going.
 *
 * The panel renders something in every case, including the ones where
 * there is no suggestion — a blank space where advice sometimes appears
 * reads as a bug, and the reasons ("you have not checked in today",
 * "everything left is heavier than today") are each useful on their own.
 *
 * It does not move anything. The step is named and linked; the plan
 * keeps its order, because that order carries dependencies the planner
 * chose and rearranging somebody's work because they slept badly breaks
 * the plan to serve the mood.
 */
export function EnergySuggestion({
  steps,
  missionId,
  energyLevel,
  checkInAt,
}: {
  steps: MissionStep[];
  missionId: string | null;
  energyLevel: number | null;
  checkInAt: string | null;
}) {
  const t = useTranslations("dashboard.energySuggestion");

  // Nothing to suggest against. Rendered as nothing rather than as an
  // explanation, because "you have no active mission" is already obvious
  // from the empty Missions widget beside it.
  if (!missionId || steps.length === 0) return null;

  const level =
    typeof energyLevel === "number" && energyLevel >= 1 && energyLevel <= 5
      ? (Math.round(energyLevel) as EnergyLevel)
      : null;

  const suggestion = suggestStepForEnergy({ steps, level, checkInAt });

  let body: React.ReactNode;
  switch (suggestion.kind) {
    case "no_checkin":
      body = <p className="text-xs text-muted">{t("noCheckIn")}</p>;
      break;
    case "stale_checkin":
      body = <p className="text-xs text-muted">{t("staleCheckIn")}</p>;
      break;
    case "nothing_left":
      body = <p className="text-xs text-muted">{t("nothingLeft")}</p>;
      break;
    case "all_too_heavy":
      body = (
        <p className="text-xs text-muted">
          {t("allTooHeavy", { demand: t(`demands.${suggestion.lightestDemand}`) })}
        </p>
      );
      break;
    case "step":
      body = (
        <>
          <p className="text-sm font-medium">{suggestion.step.text}</p>
          <p className="mt-1 text-xs text-muted">
            {t("because", {
              n: suggestion.index + 1,
              demand: t(`demands.${suggestion.demand}`),
              level: level ?? 0,
            })}
          </p>
          <Link
            href={`/dashboard/mission?mission=${missionId}`}
            className="mt-2 inline-block text-xs text-accent hover:underline"
          >
            {t("openMission")}
          </Link>
        </>
      );
      break;
  }

  return (
    <section className="rounded-2xl border border-border bg-panel/60 p-4">
      <h2 className="mb-2 flex items-center gap-2 text-xs font-medium text-muted">
        <Battery className="h-4 w-4" aria-hidden="true" />
        {t("title")}
      </h2>
      {body}
    </section>
  );
}
