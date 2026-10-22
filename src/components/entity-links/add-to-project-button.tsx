"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { FolderPlus } from "lucide-react";
import { useTranslations } from "next-intl";
// Deferred, same reason as LinkToButton beside it: a picker that reads
// every project, on a button that sits on every tool's result row.
const AddToProjectModal = dynamic(
  () => import("@/components/entity-links/add-to-project-modal").then((m) => m.AddToProjectModal),
  { ssr: false }
);
import {
  recordActionClasses,
  recordActionIconClasses,
  type RecordActionVariant,
} from "@/components/ui/record-action-variants";

/**
 * «⋯ → Προσθήκη σε Project» (owner's message 2026-10-22, point 6): the one
 * action every tool's result row gets, so a site, an automation, a
 * research report, a code session or a conversation can be filed into a
 * project without six different pickers.
 *
 * SAME TRIGGER/HOST-OWNS-THE-MODAL CONTRACT AS `LinkToButton` BESIDE IT,
 * for the identical reason documented there: a card's "..." menu renders
 * `menuExtra` inside `{open && (...)}` and unmounts the moment its own
 * `close()` runs, so a modal that lived inside THIS component would
 * unmount with the menu before it ever painted. `onOpen`, when given,
 * makes this a trigger only and the caller renders `<AddToProjectModal>`
 * itself, outside the menu.
 */
export function AddToProjectButton({
  sourceTable,
  sourceId,
  sourceHeadline,
  variant = "icon",
  onActivate,
  onOpen,
}: {
  sourceTable: string;
  sourceId: string;
  sourceHeadline: string;
  /** See record-action-variants.ts — chrome only, same action. */
  variant?: RecordActionVariant;
  /** Called before the modal opens — lets a host menu close itself. */
  onActivate?: () => void;
  /** When provided, this button is a TRIGGER ONLY and the caller owns the modal. */
  onOpen?: () => void;
}) {
  const t = useTranslations("projects.addToProject");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        data-menu-item={variant === "menuItem" ? "" : undefined}
        role={variant === "menuItem" ? "menuitem" : undefined}
        onClick={() => {
          onActivate?.();
          if (onOpen) onOpen();
          else setOpen(true);
        }}
        aria-label={`${t("button")}: ${sourceHeadline}`}
        title={t("button")}
        className={recordActionClasses(variant)}
      >
        <FolderPlus className={recordActionIconClasses(variant)} />
        {variant !== "icon" && t("button")}
      </button>
      {!onOpen && open && (
        <AddToProjectModal
          open={open}
          onClose={() => setOpen(false)}
          sourceTable={sourceTable}
          sourceId={sourceId}
          sourceHeadline={sourceHeadline}
        />
      )}
    </>
  );
}
