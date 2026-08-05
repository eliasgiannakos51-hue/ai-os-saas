"use client";

import { useTranslations } from "next-intl";
import { ClipboardCheck, ListChecks } from "lucide-react";
import { MISSION_ICON } from "@/lib/module-icons";
import { EntityCard, type EntityCardStatusTone } from "@/components/ui/entity-card";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { getStuckStep } from "@/lib/mission-progress";
import type { Mission, MissionStatus } from "@/types/mission";

const STATUS_LABEL_KEYS: Record<MissionStatus, string> = {
  planning: "statusPlanning",
  in_progress: "statusInProgress",
  completed: "statusCompleted",
  failed: "statusFailed",
};

const STATUS_TONES: Record<MissionStatus, EntityCardStatusTone> = {
  planning: "neutral",
  in_progress: "active",
  completed: "success",
  failed: "danger",
};

/**
 * A mission as the shared EntityCard.
 *
 * The card summarises; the step list, the agent pickers and the Reviewer
 * output all live in MissionDetail, which opens when the card is clicked.
 * Before this split, every mission on the page rendered its entire step
 * list inline — which is why the mission list needed a page size of five
 * while every other list in the app used twenty.
 */
export function MissionCard({
  mission,
  index,
  selected,
  initialFavorited = false,
  onOpen,
}: {
  mission: Mission;
  index: number;
  selected: boolean;
  initialFavorited?: boolean;
  onOpen: (tab?: "steps" | "review") => void;
}) {
  const t = useTranslations("dashboard.mission");
  const tModule = useTranslations("module");

  const steps = mission.plan_steps?.steps ?? [];
  const review = mission.plan_steps?.review;
  const completed = steps.filter((s) => s.status === "completed").length;
  const stuckStep = getStuckStep(mission);
  const nextStep = steps.find((s) => s.status !== "completed");

  // What the card's two description lines say, in order of what a user
  // actually wants to know at a glance: what's blocked, else what's next,
  // else — for a finished mission — what the Reviewer concluded.
  const description = stuckStep
    ? t("stillWorkingOn", { step: stuckStep.text })
    : nextStep
      ? t("nextStep", { step: nextStep.text })
      : review || null;

  return (
    <EntityCard
      index={index}
      selected={selected}
      icon={MISSION_ICON}
      accentSlug="missionControl"
      title={mission.goal}
      description={description}
      onSelect={() => onOpen()}
      tags={[
        { key: "steps", label: t("stepsProgress", { done: completed, total: steps.length }) },
      ]}
      status={{
        label: t(STATUS_LABEL_KEYS[mission.status]),
        tone: STATUS_TONES[mission.status],
        pulse: mission.status === "in_progress",
      }}
      corner={
        <FavoriteButton
          table="ai_missions"
          recordId={mission.id}
          headline={mission.goal}
          initialFavorited={initialFavorited}
          variant="inline"
        />
      }
      menuLabel={tModule("actionsFor", { name: mission.goal })}
      menu={[
        { key: "steps", label: t("tabSteps"), icon: ListChecks, onSelect: () => onOpen("steps") },
        {
          key: "review",
          label: t("tabReview"),
          icon: ClipboardCheck,
          onSelect: () => onOpen("review"),
        },
      ]}
    />
  );
}
