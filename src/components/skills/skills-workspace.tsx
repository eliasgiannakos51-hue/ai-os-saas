"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { HelpTip } from "@/components/ui/help-tip";
import { SkillsList } from "@/components/skills/skills-list";
import { SkillsDetails } from "@/components/skills/skills-details";
import type { Skill } from "@/lib/skills/types";

/**
 * «29. SKILLS: ΤΟ ΜΑΘΑΙΝΕΙΣ ΜΙΑ ΦΟΡΑ» (the owner's message, 2026-10-31),
 * Κομμάτι 1: «Η σελίδα Skills στις Ρυθμίσεις: λίστα, και πατάς για να
 * ανοίξει.» — list left, details right, the same split-screen shape My
 * Stuff's own Κομμάτι 1 established (my-stuff-workspace.tsx), with
 * everything that screen needed and this one does not left out: no
 * search (nothing to filter — Κομμάτι 1 has no way to create a second
 * skill to tell apart from the first), no history drawer, no upload.
 * «ΜΟΝΟ ΕΔΩ» — the owner's own stop-gate sits right after this piece.
 */
export function SkillsWorkspace({ initialSkills }: { initialSkills: Skill[] }) {
  const t = useTranslations("dashboard.skills");
  const [selected, setSelected] = useState<Skill | null>(null);

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="skills-workspace">
      <div className="flex items-center gap-2 px-4 py-2">
        <h1 className="min-w-0 break-words text-sm font-semibold text-foreground">{t("name")}</h1>
        <HelpTip helpKey="help.skills" />
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden border-t border-divider">
        {/* LIST: full width on a phone, 360px on a computer. Hidden on a
            phone once something is selected — the details pane covers it
            full-screen instead, the same rule my-stuff-workspace.tsx
            already keeps for the same reason: there is no room for both
            on 390px. */}
        <div
          className={`h-full min-h-0 w-full shrink-0 border-e border-divider lg:w-[360px] ${
            selected ? "hidden lg:block" : ""
          }`}
        >
          <SkillsList skills={initialSkills} selectedId={selected?.id ?? null} onSelect={setSelected} />
        </div>

        {/* DETAILS: the rest of the width on a computer; on a phone, only
            drawn once something is selected. */}
        <div className={`h-full min-h-0 flex-1 ${selected ? "" : "hidden lg:block"}`}>
          {selected && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label={t("details.back")}
              data-testid="skills-details-back"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground lg:hidden"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <SkillsDetails skill={selected} />
        </div>
      </div>
    </div>
  );
}
