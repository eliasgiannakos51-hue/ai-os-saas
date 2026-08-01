"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { AskAiModal } from "@/components/records/ask-ai-modal";

export function AskAiButton({
  moduleSlug,
  moduleTitle,
  recordId,
  recordHeadline,
}: {
  moduleSlug: string;
  moduleTitle: string;
  recordId: string;
  recordHeadline: string;
}) {
  const t = useTranslations("askAi");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${t("buttonLabel")}: ${recordHeadline}`}
        title={t("buttonLabel")}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-orange-500/10 hover:text-orange-400"
      >
        <Sparkles className="h-4 w-4" />
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
