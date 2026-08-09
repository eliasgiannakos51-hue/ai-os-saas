"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * EU AI Act, Article 50 — the notice a person actually SEES.
 *
 * The app already carried a disclosure, but only in places nobody is
 * looking: the body of an agent email, a line of markdown at the bottom of
 * a generated document, and a `disclosure` string returned by an API that
 * no component rendered. On screen — chat, the website preview, a document
 * the AI wrote, a research report — there was nothing at all. A user's
 * report that they "don't see any AI indication" was simply accurate.
 *
 * Article 50 asks for content to be recognisable as AI-generated to the
 * person receiving it. Metadata is not that. Neither is a notice inside a
 * file the user has to open, or a field in a JSON response.
 *
 * So this is one component, rendered next to the content itself, in three
 * shapes for three contexts:
 *
 *   inline  — under a chat bubble or a generated field. Smallest thing
 *             that is still legible; the surrounding UI already makes it
 *             clear which message it refers to.
 *   block   — a bordered strip above or below a generated artefact (a
 *             website preview, a report, a document). Used where the
 *             content could plausibly be mistaken for something a person
 *             wrote or a real published page.
 *   badge   — a pill for a card or a toolbar, where a full sentence would
 *             not fit.
 *
 * Never `aria-hidden`. A screen-reader user has exactly the same right to
 * know a model wrote this, and hiding it would defeat the purpose while
 * looking compliant.
 */
export type AiNoticeVariant = "inline" | "block" | "badge";

export function AiGeneratedNotice({
  variant = "inline",
  className = "",
}: {
  variant?: AiNoticeVariant;
  className?: string;
}) {
  const t = useTranslations("common.aiGenerated");

  if (variant === "badge") {
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-300 ${className}`}
        title={t("long")}
      >
        <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
        {t("short")}
      </span>
    );
  }

  if (variant === "block") {
    return (
      <p
        className={`flex items-start gap-1.5 rounded-lg border border-border bg-panel/60 px-3 py-2 text-[11px] leading-relaxed text-muted ${className}`}
      >
        <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-orange-400" aria-hidden="true" />
        <span>{t("long")}</span>
      </p>
    );
  }

  return (
    <p className={`mt-1.5 flex items-center gap-1 text-[10px] leading-none text-muted/80 ${className}`}>
      <Sparkles className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
      {t("short")}
    </p>
  );
}
