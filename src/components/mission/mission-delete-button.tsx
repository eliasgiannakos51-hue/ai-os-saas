"use client";

import { useTranslations } from "next-intl";
import { Loader2, Trash2 } from "lucide-react";
import type { Mission } from "@/types/mission";
import { useMissionDelete } from "@/components/mission/use-mission-delete";

/**
 * Deleting a mission — the control that did not exist.
 *
 * NOT the shared DeleteButton, for one reason that matters: that one
 * issues a client-side `.from(table).delete()`, which is fine for a row
 * whose disappearance is the whole story. A mission takes its steps
 * (a jsonb column) and its pending scheduled runs (cascading rows) with
 * it, and the user is entitled to know that BEFORE agreeing — so this
 * goes through DELETE /api/mission/[id], which counts what it is about
 * to remove and re-checks ownership server-side.
 *
 * The confirmation names the mission and says what is lost. "Are you
 * sure?" over an unnamed thing is how somebody deletes the wrong one.
 */
export function MissionDeleteButton({
  mission,
  scheduledRuns = 0,
  variant = "menu",
  onDeleted,
}: {
  mission: Mission;
  /** Pending scheduled runs for this mission, if the caller knows. */
  scheduledRuns?: number;
  variant?: "menu" | "button";
  onDeleted?: () => void;
}) {
  const t = useTranslations("dashboard.mission");
  const { confirmAndDelete, deleting } = useMissionDelete(mission, scheduledRuns, onDeleted);
  const handleDelete = confirmAndDelete;

  if (variant === "menu") {
    return (
      <button
        type="button"
        data-testid="mission-delete"
        onClick={() => void handleDelete()}
        disabled={deleting}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-red-500/40 px-3 py-1 text-xs font-medium text-red-300 transition-colors duration-150 hover:bg-red-500/10 disabled:opacity-50"
      >
        {deleting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {t("deleteMission")}
      </button>
    );
  }

  return (
    <button
      type="button"
      data-testid="mission-delete"
      onClick={() => void handleDelete()}
      disabled={deleting}
      aria-label={t("deleteMission")}
      className="rounded-lg p-1.5 text-muted transition-colors duration-150 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
    >
      {deleting ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
