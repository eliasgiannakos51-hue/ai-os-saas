"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Brain, Trash2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type LearnedPreferenceRow = {
  category: string;
  observation: string;
  confidence: number;
  evidence_count: number;
};

/**
 * What the product has learned about you — visible and deletable
 * (V3 Task 14). Deletion goes straight through RLS (delete-own is the
 * user's GDPR right-to-object as a button); there is no insert path
 * from the client at all, so this list can only shrink from here.
 */
export function LearnedPreferencesSection({ initial }: { initial: LearnedPreferenceRow[] }) {
  const t = useTranslations("settings.learnedPreferences");
  const supabase = createClient();
  const [rows, setRows] = useState(initial);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function remove(row: LearnedPreferenceRow) {
    const key = `${row.category}:${row.observation}`;
    setDeleting(key);
    try {
      const { error } = await supabase
        .from("user_preferences_learned")
        .delete()
        .eq("category", row.category)
        .eq("observation", row.observation);
      if (!error) {
        setRows((current) =>
          current.filter((r) => !(r.category === row.category && r.observation === row.observation))
        );
      }
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section id="learned-preferences" className="rounded-2xl border border-border bg-panel p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Brain className="h-4 w-4 text-orange-400" aria-hidden="true" />
        {t("title")}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">{t("description")}</p>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-xl border border-border bg-panel/60 p-3 text-xs text-muted">
          {t("empty")}
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {rows.map((row) => {
            const key = `${row.category}:${row.observation}`;
            return (
              <li
                key={key}
                className="flex items-center gap-2 rounded-xl border border-border bg-panel/60 p-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-foreground">{row.observation}</span>
                  <span className="block text-[10px] text-muted">
                    {t("evidence", { count: row.evidence_count })}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void remove(row)}
                  disabled={deleting === key}
                  aria-label={t("forget", { observation: row.observation })}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                >
                  {deleting === key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
