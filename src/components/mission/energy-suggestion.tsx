"use client";

import { useTranslations } from "next-intl";
import { BatteryLow, BatteryMedium, BatteryFull } from "lucide-react";
import { suggestStepsForEnergy, type StepEffort } from "@/lib/mission-energy";
import type { MissionStep } from "@/types/mission";

const EFFORT_ICON: Record<StepEffort, typeof BatteryLow> = {
  light: BatteryLow,
  medium: BatteryMedium,
  deep: BatteryFull,
};

/**
 * "You said you're running low — start with this one."
 *
 * Renders NOTHING without an energy check-in. That is the whole design
 * constraint: a suggestion headed "based on your energy" when we do not
 * know their energy is a guess wearing a fact's clothes, and the user
 * cannot tell the difference. No check-in, no panel.
 */
export function EnergySuggestion({
  steps,
  energyLevel,
}: {
  steps: MissionStep[];
  /** Latest check-in, 1-5. Null when they have not checked in. */
  energyLevel: number | null;
}) {
  const t = useTranslations("dashboard.mission.energy");
  const suggestion = suggestStepsForEnergy(steps, energyLevel);

  if (!suggestion || !suggestion.top) return null;

  const Icon = EFFORT_ICON[suggestion.preferred];
  const held = suggestion.heldBack.length;

  return (
    <div className="mb-4 rounded-lg border border-border bg-panel/60 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
        <Icon className="h-3.5 w-3.5 text-orange-400/80" aria-hidden="true" />
        {t(`heading.${suggestion.preferred}`)}
      </p>
      <p className="mt-1.5 text-sm text-foreground">{suggestion.top.text}</p>
      {held > 0 && (
        // Named rather than silently hidden: a person who knows a hard
        // step is being held back can override it. One that vanishes
        // just looks like the list is wrong.
        <p className="mt-1.5 text-[11px] text-muted">{t("heldBack", { count: held })}</p>
      )}
    </div>
  );
}
