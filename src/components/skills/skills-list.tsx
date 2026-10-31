"use client";

import { useLocale, useTranslations } from "next-intl";
import { ListChecks } from "lucide-react";
import { formatDateTime } from "@/lib/format-number";
import { useFormatRelativeTime } from "@/lib/use-relative-time";
import type { Skill } from "@/lib/skills/types";

/**
 * THE LEFT COLUMN («29. SKILLS», Κομμάτι 1): «Η σελίδα Skills στις
 * Ρυθμίσεις: λίστα, και πατάς για να ανοίξει» — a row per skill, press
 * one to select it, the right column (skills-details.tsx) shows it. The
 * row carries the two things a person scans a list of taught procedures
 * by: the name, and the one line that says when Ionexa reaches for it —
 * not a kind icon or a word count, because every row here is the same
 * kind of thing.
 */
export function SkillsList({
  skills,
  selectedId,
  onSelect,
}: {
  skills: Skill[];
  selectedId: string | null;
  onSelect: (skill: Skill) => void;
}) {
  const t = useTranslations("dashboard.skills");
  const locale = useLocale();
  const formatRelativeTime = useFormatRelativeTime();

  if (skills.length === 0) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted"
        data-testid="skills-empty"
      >
        <ListChecks className="h-6 w-6 text-muted" aria-hidden="true" />
        <p className="font-medium text-foreground">{t("empty.title")}</p>
        <p>{t("empty.why")}</p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto px-2 py-3" data-testid="skills-list">
      <ul className="space-y-1">
        {skills.map((skill) => {
          const active = skill.id === selectedId;
          return (
            <li key={skill.id}>
              <button
                type="button"
                onClick={() => onSelect(skill)}
                aria-current={active ? "true" : undefined}
                data-testid="skills-list-item"
                className={`flex min-h-[44px] w-full flex-col gap-0.5 rounded-item px-3 py-2 text-start transition-colors duration-150 ${
                  active ? "bg-panel text-foreground" : "text-muted hover:bg-panel-hover hover:text-foreground"
                }`}
              >
                <span className="flex items-center justify-end text-xs text-muted">
                  <span title={formatDateTime(skill.createdAt, locale)} suppressHydrationWarning>
                    {formatRelativeTime(skill.createdAt)}
                  </span>
                </span>
                {/* FULL NAME, TWO LINES IF NEEDED — never truncated (the
                    standing rule every list screen in this product
                    keeps: κανένα όνομα δεν κόβεται). */}
                <span className="break-words text-sm font-medium text-foreground">{skill.name}</span>
                {skill.whenUsed && <span className="break-words text-xs text-muted">{skill.whenUsed}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
