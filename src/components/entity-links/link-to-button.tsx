"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { LinkToModal } from "@/components/entity-links/link-to-modal";
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
}: {
  sourceTable: string;
  sourceId: string;
  sourceHeadline: string;
  /** See record-action-variants.ts — chrome only, same action. */
  variant?: RecordActionVariant;
  /** Called before the modal opens — lets a host menu close itself. */
  onActivate?: () => void;
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
          setOpen(true);
        }}
        aria-label={`${t("buttonLabel")}: ${sourceHeadline}`}
        title={t("buttonLabel")}
        className={recordActionClasses(variant)}
      >
        <Link2 className={recordActionIconClasses(variant)} />
        {variant !== "icon" && t("buttonLabel")}
      </button>
      <LinkToModal
        open={open}
        onClose={() => setOpen(false)}
        sourceTable={sourceTable}
        sourceId={sourceId}
        sourceHeadline={sourceHeadline}
      />
    </>
  );
}
