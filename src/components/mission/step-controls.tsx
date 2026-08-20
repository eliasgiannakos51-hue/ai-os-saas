"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Check, Loader2, Pencil, Trash2, Undo2, X } from "lucide-react";
import type { MissionStep } from "@/types/mission";
import type { RemovedRun } from "@/lib/mission-step-edits-types";

/** How long "Undo" stays on offer after a step is deleted. */
export const UNDO_WINDOW_MS = 5000;

export type PendingUndo = {
  index: number;
  step: MissionStep;
  runs: RemovedRun[];
};

/**
 * The three things a user can do to a step they no longer agree with:
 * remove it, rewrite it, move it.
 *
 * WHY DELETE HAS NO CONFIRMATION AND MISSION DELETE DOES. A confirmation
 * is worth its interruption when the action is large and unrecoverable —
 * a whole mission with its history is both. One step of a plan is
 * neither, and a dialog on every one of them trains people to click
 * through dialogs. So this deletes immediately and offers UNDO for five
 * seconds, which restores the step AND the pending scheduled runs that
 * went with it (see lib/mission-step-edits.ts — the runs point at steps
 * by INDEX, so putting one back is not just an array splice).
 */
export function StepControls({
  index,
  total,
  text,
  busy,
  onDelete,
  onEdit,
  onMove,
}: {
  index: number;
  total: number;
  text: string;
  busy: boolean;
  onDelete: () => void;
  onEdit: (text: string) => void;
  onMove: (direction: "up" | "down") => void;
}) {
  const t = useTranslations("dashboard.mission");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // A step rewritten elsewhere (the cron, another tab) must not be
  // overwritten by a draft this component was holding from before.
  useEffect(() => {
    if (!editing) setDraft(text);
  }, [text, editing]);

  if (editing) {
    return (
      <div className="mt-1.5 flex flex-col gap-1.5">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={500}
          rows={2}
          data-testid="step-edit-input"
          aria-label={t("editStep")}
          className="input min-h-[54px] resize-y text-sm"
          onKeyDown={(e) => {
            // Enter saves, Shift+Enter is a newline, Escape abandons —
            // the same keys the rest of the app's inline edits use.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (draft.trim()) {
                onEdit(draft.trim());
                setEditing(false);
              }
            }
            if (e.key === "Escape") {
              setDraft(text);
              setEditing(false);
            }
          }}
        />
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="step-edit-save"
            disabled={!draft.trim() || busy}
            onClick={() => {
              onEdit(draft.trim());
              setEditing(false);
            }}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1 text-xs font-semibold text-black transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
          >
            <Check className="h-3 w-3" aria-hidden="true" />
            {t("saveStep")}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(text);
              setEditing(false);
            }}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition-colors duration-150 hover:text-foreground"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            {t("cancelStepEdit")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        data-testid="step-move-up"
        disabled={index === 0 || busy}
        onClick={() => onMove("up")}
        aria-label={t("moveStepUp")}
        title={t("moveStepUp")}
        className="rounded-md p-1 text-muted transition-colors duration-150 hover:bg-panel hover:text-foreground disabled:opacity-30"
      >
        <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        data-testid="step-move-down"
        disabled={index >= total - 1 || busy}
        onClick={() => onMove("down")}
        aria-label={t("moveStepDown")}
        title={t("moveStepDown")}
        className="rounded-md p-1 text-muted transition-colors duration-150 hover:bg-panel hover:text-foreground disabled:opacity-30"
      >
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        data-testid="step-edit"
        disabled={busy}
        onClick={() => setEditing(true)}
        aria-label={t("editStep")}
        title={t("editStep")}
        className="rounded-md p-1 text-muted transition-colors duration-150 hover:bg-panel hover:text-foreground disabled:opacity-30"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        data-testid="step-delete"
        disabled={busy}
        onClick={onDelete}
        aria-label={t("deleteStep")}
        title={t("deleteStep")}
        className="rounded-md p-1 text-muted transition-colors duration-150 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

/**
 * The strip that stands where a deleted step was, counting down.
 *
 * In the list rather than in a toast, deliberately: the undo belongs
 * where the thing it undoes used to be, and a toast in the corner is the
 * one place a user looking at their plan is not looking.
 */
export function StepUndoStrip({
  seconds,
  onUndo,
}: {
  seconds: number;
  onUndo: () => void;
}) {
  const t = useTranslations("dashboard.mission");
  return (
    <li
      data-testid="step-undo"
      className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-orange-500/40 bg-orange-500/[0.06] px-3 py-2.5"
    >
      <span className="text-xs text-muted">{t("stepDeleted")}</span>
      <button
        type="button"
        data-testid="step-undo-button"
        onClick={onUndo}
        className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-orange-500/40 px-2.5 py-1 text-xs font-medium text-orange-300 transition-colors duration-150 hover:bg-orange-500/10"
      >
        <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
        {t("undoWithSeconds", { seconds })}
      </button>
    </li>
  );
}
