"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/toast/toast-context";
import { getErrorMessage } from "@/lib/get-error-message";
import type { Mission } from "@/types/mission";

/**
 * Confirm, then delete a mission — ONE implementation, because it is
 * reachable from two places (the card's menu and the detail header) and
 * two implementations of a destructive confirmation is how one of them
 * ends up without the sentence that says what is lost.
 *
 * The confirmation names the mission and counts what goes with it: the
 * steps (a jsonb column of the same row) and the pending scheduled runs
 * (separate rows, removed by the foreign key's cascade). "Are you sure?"
 * over an unnamed thing is how somebody deletes the wrong mission.
 */
export function useMissionDelete(mission: Mission, scheduledRuns = 0, onDeleted?: () => void) {
  const t = useTranslations("dashboard.mission");
  const router = useRouter();
  const { addToast } = useToast();
  const [deleting, setDeleting] = useState(false);

  async function confirmAndDelete() {
    const steps = mission.plan_steps?.steps ?? [];
    const completed = steps.filter((s) => s.status === "completed").length;
    const question = t("deleteConfirmMission", { goal: mission.goal });
    const loses = t("deleteConfirmLoses", {
      steps: steps.length,
      completed,
      scheduled: scheduledRuns,
    });
    if (!window.confirm(`${question}\n\n${loses}`)) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/mission/${mission.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({ ok: false }));
      if (!data.ok) {
        addToast(`✗ ${data.error ?? t("deleteFailed")}`, "error");
        return;
      }
      addToast(`✓ ${t("deletedMission")}`);
      onDeleted?.();
      router.refresh();
    } catch (err) {
      addToast(`✗ ${getErrorMessage(err, t("deleteFailed"))}`, "error");
    } finally {
      setDeleting(false);
    }
  }

  return { confirmAndDelete, deleting };
}
