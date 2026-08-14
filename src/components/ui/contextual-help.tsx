"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { HelpCircle, ArrowRight, X } from "lucide-react";

/**
 * The "?" next to a page title.
 *
 * Collapsed by default, because a paragraph of explanation permanently
 * pinned under every heading is something a returning user reads past
 * fifty times to reach the thing they came for. Open, it shows ONE
 * paragraph — the same one /help and the support bot give for this
 * question — and a link to the full article.
 *
 * The text is passed in rather than looked up here so the lookup stays on
 * the server (lib/support/help-topics.ts) and the whole 27-article
 * knowledge base does not end up in the client bundle for the sake of one
 * paragraph.
 */
export function ContextualHelp({
  title,
  body,
  articleId,
}: {
  title: string;
  body: string;
  articleId: string;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("common");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t("whatIsThis")}
        title={t("whatIsThis")}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-orange-400"
      >
        <HelpCircle className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-2xl border border-border bg-panel p-4 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("close")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
          <Link
            href={`/help#${articleId}`}
            className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-orange-400 transition-colors duration-150 hover:text-orange-300"
          >
            {t("moreInHelp")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </>
  );
}
