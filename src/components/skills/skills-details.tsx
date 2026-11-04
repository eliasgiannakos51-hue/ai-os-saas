"use client";

import { useTranslations } from "next-intl";
import { FileText, ListChecks as EmptyIcon, PanelRightOpen } from "lucide-react";
import type { Skill } from "@/lib/skills/types";

/**
 * THE RIGHT COLUMN («29. SKILLS», Κομμάτι 1) — the four things the
 * directive names: όνομα, πότε χρησιμοποιείται, βήματα, αρχεία. Nothing
 * else: no edit, no delete, no "run now" — Κομμάτι 1 is the screen
 * alone, and the first write path (creating a skill) is Κομμάτι 2's own
 * piece, not this one's.
 */
export function SkillsDetails({ skill }: { skill: Skill | null }) {
  const t = useTranslations("dashboard.skills");

  if (!skill) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted"
        data-testid="skills-details-empty"
      >
        <PanelRightOpen className="h-6 w-6 text-muted" aria-hidden="true" />
        {t("details.empty")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-6 py-6" data-testid="skills-details">
      {/* NAME, full and never truncated. */}
      <h2 className="break-words text-lg font-semibold text-foreground">{skill.name}</h2>

      {/* ΠΟΤΕ ΧΡΗΣΙΜΟΠΟΙΕΙΤΑΙ — when Ionexa reaches for this on its own. */}
      <section data-testid="skills-when-used">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted">{t("details.whenUsedLabel")}</h3>
        <p className="mt-1 break-words text-sm text-body">
          {skill.whenUsed || <span className="text-muted">{t("details.whenUsedEmpty")}</span>}
        </p>
      </section>

      {/* ΒΗΜΑΤΑ — read top to bottom, the order the owner's own test of a
          skill ("does the right skill fire, and does it follow its own
          steps") checks against. */}
      <section data-testid="skills-steps">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted">{t("details.stepsLabel")}</h3>
        {skill.steps.length > 0 ? (
          <ol className="mt-2 space-y-2">
            {skill.steps.map((step, i) => (
              <li key={i} className="flex gap-2 text-sm text-body" data-testid="skills-step">
                <span className="shrink-0 text-muted">{i + 1}.</span>
                <span className="break-words">{step}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1 text-sm text-muted">{t("details.stepsEmpty")}</p>
        )}
      </section>

      {/* ΑΡΧΕΙΑ (πρότυπα, παραδείγματα) — drawn even when empty, because
          the directive names files as one of the four things a skill
          HAS, same as steps above; a section that only appears once
          there is something in it would read as "files are not part of
          a skill" rather than "nobody has attached one yet". No upload
          here: nothing in this piece writes to this column
          (supabase/migrations/20261107000000_user_skills.sql grants
          select only), so what shows is always real. */}
      <section data-testid="skills-files">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted">{t("details.filesLabel")}</h3>
        {skill.files.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {skill.files.map((file, i) => (
              <li key={i} data-testid="skills-file">
                <a
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-[44px] items-center gap-2 rounded-item px-2 text-sm text-foreground hover:bg-panel-hover"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  <span className="break-words">{file.name}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-2 flex items-center gap-2 text-sm text-muted">
            <EmptyIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("details.filesEmpty")}
          </div>
        )}
      </section>
    </div>
  );
}
