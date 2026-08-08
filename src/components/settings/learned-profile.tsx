"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Brain, Pencil, Trash2, Check, X } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { formatDateTime } from "@/lib/format-number";
import { getErrorMessage } from "@/lib/get-error-message";
import { PROFILE_CATEGORIES, isActive, type ProfileCategory } from "@/lib/profile/maturity";

export type LearnedRow = {
  id: string;
  category: ProfileCategory;
  observation: string;
  confidence: number;
  evidence_count: number;
  first_seen: string;
  last_confirmed: string;
  user_edited: boolean;
};

/**
 * Everything the assistant thinks it knows, and the three things a person
 * can do about it.
 *
 * THE FADING ONES ARE SHOWN TOO, greyed out. An observation whose
 * confidence has decayed below the active threshold is no longer used in
 * any prompt, but hiding it would make the list a curated view rather than
 * a record — and "why did it stop doing that?" deserves an answer. The
 * label says plainly that it is no longer being used.
 *
 * Editing sets user_edited server-side, which permanently exempts the row
 * from the observer. That is the difference between a correction and a
 * suggestion: a fix the system reverts on its next run is worse than no
 * fix, because the person believes it took.
 */
export function LearnedProfile({
  rows: initialRows,
  percent,
  level,
  actions,
  actionsToNext,
}: {
  rows: LearnedRow[];
  percent: number;
  level: number;
  actions: number;
  actionsToNext: number | null;
}) {
  const t = useTranslations("settings.learnedProfile");
  const locale = useLocale();
  const { addToast } = useToast();
  const [rows, setRows] = useState(initialRows);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<ProfileCategory, LearnedRow[]>();
    for (const row of rows) {
      const list = map.get(row.category) ?? [];
      list.push(row);
      map.set(row.category, list);
    }
    return map;
  }, [rows]);

  async function remove(id: string) {
    if (!window.confirm(t("confirmDelete"))) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/profile?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("error"), "error");
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
      addToast(t("deleted"));
    } catch (err) {
      addToast(getErrorMessage(err, t("error")), "error");
    } finally {
      setBusy(false);
    }
  }

  async function forgetAll() {
    if (!window.confirm(t("confirmForgetAll"))) return;
    setBusy(true);
    try {
      const response = await fetch("/api/profile?all=1", { method: "DELETE" });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("error"), "error");
        return;
      }
      setRows([]);
      addToast(t("forgotten"));
    } catch (err) {
      addToast(getErrorMessage(err, t("error")), "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    const text = draft.trim();
    if (text.length < 3) return;
    setBusy(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, observation: text }),
      });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("error"), "error");
        return;
      }
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, observation: text, user_edited: true } : r))
      );
      setEditingId(null);
      addToast(t("saved"));
    } catch (err) {
      addToast(getErrorMessage(err, t("error")), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 space-y-4 rounded-2xl border border-border bg-panel p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Brain className="h-4 w-4 text-orange-400" aria-hidden="true" /> {t("title")}
      </h2>
      <p className="text-xs leading-relaxed text-muted">{t("description")}</p>

      {/* Progress. The number counts ACTIONS, never days — see
          lib/profile/maturity.ts — and the label says so, because "you
          have been a member for 4 months" and "you have done 63 things"
          are different claims and only the second one is true here. */}
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-foreground">
            {t("progress", { percent })}
          </span>
          <span className="text-[11px] text-muted">{t("levelLabel", { level })}</span>
        </div>
        <div
          className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-input"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("progress", { percent })}
        >
          <div
            className="h-full rounded-full bg-orange-500 transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-muted">
          {actionsToNext === null
            ? t("actionsMax", { actions })
            : t("actionsToNext", { actions, remaining: actionsToNext })}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted">{t("nothingYet")}</p>
      ) : (
        <div className="space-y-4">
          {PROFILE_CATEGORIES.filter((c) => (grouped.get(c) ?? []).length > 0).map((category) => (
            <div key={category}>
              <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
                {t(`category.${category}`)}
              </h3>
              <ul className="space-y-1.5">
                {(grouped.get(category) ?? []).map((row) => {
                  const active = isActive(row.confidence);
                  return (
                    <li
                      key={row.id}
                      className={`rounded-xl border border-border p-3 ${active ? "bg-input" : "bg-input/40"}`}
                    >
                      {editingId === row.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            maxLength={300}
                            aria-label={t("editLabel")}
                            className="min-w-0 flex-1 rounded-lg border border-border bg-panel px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-orange-500"
                          />
                          <button
                            type="button"
                            onClick={() => void saveEdit(row.id)}
                            disabled={busy}
                            aria-label={t("save")}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-black disabled:opacity-60"
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            aria-label={t("cancel")}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p
                            className={`min-w-0 flex-1 text-xs leading-relaxed ${
                              active ? "text-foreground" : "text-muted line-through"
                            }`}
                          >
                            {row.observation}
                          </p>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(row.id);
                                setDraft(row.observation);
                              }}
                              aria-label={t("edit")}
                              title={t("edit")}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void remove(row.id)}
                              disabled={busy}
                              aria-label={t("delete")}
                              title={t("delete")}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-red-950/30 hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      )}
                      <p className="mt-1 text-[10px] text-muted">
                        {active
                          ? t("meta", {
                              times: row.evidence_count,
                              when: formatDateTime(row.last_confirmed, locale),
                            })
                          : t("fading")}
                        {row.user_edited ? ` · ${t("yourWording")}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => void forgetAll()}
        disabled={busy || rows.length === 0}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-red-900 px-3 py-1.5 text-[11px] font-medium text-red-400 transition-colors duration-150 hover:bg-red-950/30 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        {t("forgetAll")}
      </button>
    </div>
  );
}
