"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { LinkToModal } from "@/components/entity-links/link-to-modal";

export function LinkToButton({
  sourceTable,
  sourceId,
  sourceHeadline,
}: {
  sourceTable: string;
  sourceId: string;
  sourceHeadline: string;
}) {
  const t = useTranslations("entityLinks");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${t("buttonLabel")}: ${sourceHeadline}`}
        title={t("buttonLabel")}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-orange-500/10 hover:text-orange-400"
      >
        <Link2 className="h-4 w-4" />
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
