"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Presentation, Loader2 } from "lucide-react";
import { ListLayout } from "@/components/ui/list-layout";
import { EntityCard } from "@/components/ui/entity-card";
import { useToast } from "@/components/toast/toast-context";
import { formatDate } from "@/lib/format-number";
import { readUsageReceipt } from "@/lib/billing/usage-receipt";
import { appendClarificationAnswers } from "@/lib/clarification-client";
import { PRESENTATION_THEMES, DEFAULT_THEME_ID } from "@/lib/presentations/themes";
import {
  DEFAULT_SLIDE_COUNT,
  MAX_BRIEF_CHARS,
  MAX_SLIDES,
  MIN_SLIDES,
} from "@/lib/presentations/slides";

export type PresentationListItem = {
  id: string;
  title: string;
  theme: string;
  status: string;
  credits_charged: number | null;
  share_enabled: boolean | null;
  created_at: string;
};

/**
 * The presentations list, and the form that makes a new one.
 *
 * Built on the shared ListLayout and EntityCard rather than a layout of
 * its own — that is the whole point of those two components, and this
 * page replaces a "tracker" that had its own arrangement of the same
 * ideas. A user arriving here from Documents or the Website Builder
 * should not have to work out where "new" is again.
 *
 * The editor lives on its own route rather than in a panel here. A deck
 * is a document, not a row: it wants the whole window, a URL that can be
 * bookmarked, and a back button that means something.
 */
export function PresentationsWorkspace({
  initialPresentations,
  monthlyCap,
  usedThisMonth,
}: {
  initialPresentations: PresentationListItem[];
  monthlyCap: number | null;
  usedThisMonth: number;
}) {
  const t = useTranslations("dashboard.presentations");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();

  const [items] = useState<PresentationListItem[]>(initialPresentations);
  const [search, setSearch] = useState("");
  const [composing, setComposing] = useState(false);

  const [brief, setBrief] = useState("");
  const [slideCount, setSlideCount] = useState(DEFAULT_SLIDE_COUNT);
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID);
  const [busy, setBusy] = useState(false);

  const [questions, setQuestions] = useState<string[] | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.title.toLowerCase().includes(q));
  }, [items, search]);

  const outOfRuns = monthlyCap !== null && usedThisMonth >= monthlyCap;

  async function generate(finalBrief: string, skipClarification: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/presentations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: finalBrief,
          slideCount,
          theme: themeId,
          skipClarification,
        }),
      });
      const data = await res.json().catch(() => null);

      const receipt = readUsageReceipt(data);
      if (receipt && receipt.creditsCharged > 0) {
        addToast(t("charged", { credits: receipt.creditsCharged }), "success");
      }

      if (!res.ok || !data?.ok) {
        addToast(data?.error || t("errors.generic"), "error");
        return;
      }

      if (data.needsClarification) {
        setQuestions(data.questions as string[]);
        setAnswers(new Array((data.questions as string[]).length).fill(""));
        return;
      }

      // Straight into the editor. A deck the user cannot immediately
      // see and change is a deck they have to go and find.
      router.push(`/dashboard/presentations/${data.presentation.id}`);
      router.refresh();
    } catch {
      addToast(t("errors.generic"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ListLayout
      newAction={
        <button
          type="button"
          className="btn-primary"
          onClick={() => setComposing((v) => !v)}
          disabled={outOfRuns}
        >
          {t("newDeck")}
        </button>
      }
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder={t("searchPlaceholder")}
      searchId="presentation-search"
      meta={
        monthlyCap !== null ? (
          <span className="text-[11px] text-muted">
            {t("capUsed", { used: usedThisMonth, cap: monthlyCap })}
          </span>
        ) : null
      }
    >
      {composing && !questions ? (
        <form
          className="mb-6 space-y-4 rounded-2xl border border-border bg-panel/60 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void generate(brief, false);
          }}
        >
          <div>
            <label htmlFor="deck-brief" className="mb-1 block text-xs font-medium text-muted">
              {t("briefLabel")}
            </label>
            <textarea
              id="deck-brief"
              className="input min-h-[96px]"
              value={brief}
              maxLength={MAX_BRIEF_CHARS}
              onChange={(e) => setBrief(e.target.value)}
              placeholder={t("briefPlaceholder")}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="deck-slides" className="mb-1 block text-xs font-medium text-muted">
                {t("slideCountLabel", { count: slideCount })}
              </label>
              <input
                id="deck-slides"
                type="range"
                min={MIN_SLIDES}
                max={MAX_SLIDES}
                value={slideCount}
                onChange={(e) => setSlideCount(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="deck-theme" className="mb-1 block text-xs font-medium text-muted">
                {t("themeLabel")}
              </label>
              <select
                id="deck-theme"
                className="input"
                value={themeId}
                onChange={(e) => setThemeId(e.target.value)}
              >
                {PRESENTATION_THEMES.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {t(`themes.${theme.nameKey}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={busy || brief.trim().length < 10}>
              {busy ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {t("generating")}
                </span>
              ) : (
                t("generate")
              )}
            </button>
            <p className="text-[11px] text-muted">{t("generateNote")}</p>
          </div>
        </form>
      ) : null}

      {questions ? (
        <form
          className="mb-6 space-y-4 rounded-2xl border border-border bg-panel/60 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            // The original brief plus the answers, resubmitted with the
            // pre-check turned off — the shared format every other AI
            // entry point in this app uses, so a user's answers are
            // folded in the same way everywhere.
            void generate(appendClarificationAnswers(brief, questions, answers), true);
            setQuestions(null);
          }}
        >
          <p className="text-sm font-medium">{t("clarifyTitle")}</p>
          {questions.map((question, i) => (
            <div key={i}>
              <label htmlFor={`clarify-${i}`} className="mb-1 block text-xs text-muted">
                {question}
              </label>
              <input
                id={`clarify-${i}`}
                className="input"
                value={answers[i] ?? ""}
                onChange={(e) => {
                  const next = [...answers];
                  next[i] = e.target.value;
                  setAnswers(next);
                }}
              />
            </div>
          ))}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? t("generating") : t("generate")}
          </button>
        </form>
      ) : null}

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          {items.length === 0 ? t("empty") : t("noMatches")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item, index) => (
            <EntityCard
              key={item.id}
              icon={Presentation}
              accentSlug="presentations"
              title={item.title || t("untitled")}
              description={formatDate(item.created_at, locale)}
              href={`/dashboard/presentations/${item.id}`}
              index={index}
              tags={
                item.share_enabled
                  ? [{ key: "shared", label: t("sharedTag"), tone: "accent" as const }]
                  : []
              }
              status={
                item.status === "ready"
                  ? { label: t("statusReady"), tone: "success" as const }
                  : item.status === "failed"
                    ? { label: t("statusFailed"), tone: "danger" as const }
                    : { label: t("statusGenerating"), tone: "active" as const, pulse: true }
              }
            />
          ))}
        </div>
      )}
    </ListLayout>
  );
}
