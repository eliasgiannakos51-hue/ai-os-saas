"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
// Deferred, same reason as the Ask-AI modal beside it: a picker that
// searches every module, on a button that sits on every record.
const LinkToModal = dynamic(
  () => import("@/components/entity-links/link-to-modal").then((m) => m.LinkToModal),
  { ssr: false },
);
import {
  recordActionClasses,
  recordActionIconClasses,
  type RecordActionVariant,
} from "@/components/ui/record-action-variants";

export function LinkToButton({
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
  /**
   * When provided, this button is a TRIGGER ONLY and the caller owns the
   * modal.
   *
   * It exists because the self-contained version is unreachable from a
   * card's "..." menu, which is where it is used most. CardMenu renders
   * `menuExtra` inside `{open && (...)}`, and this button's onClick calls
   * `onActivate()` — which closes that menu — before setting its own state.
   * Both updates flush together, the dropdown unmounts, and the modal that
   * lives in this component's own tree unmounts with it before it ever
   * paints. The dialog was not slow or misplaced; it never existed.
   *
   * So the card keeps the modal, which outlives the menu, and the menu item
   * only says "open it".
   */
  onOpen?: () => void;
}) {
  const t = useTranslations("entityLinks");
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
        aria-label={`${t("buttonLabel")}: ${sourceHeadline}`}
        title={t("buttonLabel")}
        className={recordActionClasses(variant)}
      >
        <Link2 className={recordActionIconClasses(variant)} />
        {variant !== "icon" && t("buttonLabel")}
      </button>
      {!onOpen && open && (
      <LinkToModal
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
