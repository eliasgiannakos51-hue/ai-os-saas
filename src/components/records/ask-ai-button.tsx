"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { AskAiModal } from "@/components/records/ask-ai-modal";
import {
  recordActionClasses,
  recordActionIconClasses,
  type RecordActionVariant,
} from "@/components/ui/record-action-variants";

export function AskAiButton({
  moduleSlug,
  moduleTitle,
  recordId,
  recordHeadline,
  variant = "icon",
  onActivate,
}: {
  moduleSlug: string;
  moduleTitle: string;
  recordId: string;
  recordHeadline: string;
  /** See record-action-variants.ts — chrome only, same action. */
  variant?: RecordActionVariant;
  /** Called before the modal opens — lets a host menu close itself. */
  onActivate?: () => void;
}) {
  const t = useTranslations("askAi");
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
        aria-label={`${t("buttonLabel")}: ${recordHeadline}`}
        title={t("buttonLabel")}
        className={recordActionClasses(variant)}
      >
        <Sparkles className={recordActionIconClasses(variant)} />
        {variant !== "icon" && t("buttonLabel")}
      </button>
      <AskAiModal
        open={open}
        onClose={() => setOpen(false)}
        moduleSlug={moduleSlug}
        moduleTitle={moduleTitle}
        recordId={recordId}
        recordHeadline={recordHeadline}
      />
    </>
  );
}
