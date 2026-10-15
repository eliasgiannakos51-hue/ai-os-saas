"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, FileText, X } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import type { Answer, Citation } from "@/lib/files/answer";
import { labelParts, pdfPageHref, splitAnswer, uniquePages } from "@/lib/files/page-refs";

/**
 * AN ANSWER THAT SAYS WHERE (MASTER 16, package 12: «η απάντηση γράφει σε
 * ποια σελίδα το βρήκε»), behind the switch "file-pages". On the Files shell
 * and the Files page, one component.
 *
 * Every reference the checker kept (lib/files/ask.ts) is pressed — in the
 * answer where it stands, and in the list of pages under it — and opens
 * THAT page: its own words, read back from the file (api/files/[id]?page=N),
 * and for a PDF the file itself at that page in a new tab
 * (api/files/[id]/view). A PDF read only in part says which pages the
 * answer never saw. Held by scripts/tests/file-pages.test.mjs.
 */

/**
 * A stored page label, shown in the reader's language: «Σελίδα 12» on a
 * Greek screen for the "Page 12" extraction stored (lib/files/page-refs.ts,
 * labelParts). Every place on the Files screens that shows a label shows it
 * through this; what is stored, matched and linked stays as it was.
 */
export function usePageLabel(): (label: string) => string {
  const t = useTranslations("dashboard.files.pageRefs");
  return (label) => {
    const parts = labelParts(label);
    return !parts ? label : parts.unit === "page" ? t("page", { n: parts.n }) : t("rows", { n: parts.n });
  };
}

// A reference inside a sentence stays the height of the line, as a link
// in running text does: a 44px box there would push the lines of the
// answer apart. The 44px target for every page is the list under the
// answer (CitedPages), which names the same pages once each.
const CHIP =
  "mx-0.5 inline rounded-item bg-panel px-1.5 py-0.5 align-baseline text-xs text-foreground underline decoration-dotted underline-offset-2 hover:bg-panel-hover";

export function CitedAnswerText({ answer, onOpen }: { answer: Answer; onOpen: (c: Citation) => void }) {
  const t = useTranslations("dashboard.files.pageRefs");
  const show = usePageLabel();
  return (
    <p data-testid="files-answer-text" className="whitespace-pre-wrap break-words text-sm leading-relaxed text-body">
      {splitAnswer(answer.text, answer.citations).map((piece, i) =>
        "text" in piece ? (
          <span key={i}>{piece.text}</span>
        ) : (
          <button
            key={i}
            type="button"
            onClick={() => onOpen(piece.citation)}
            aria-label={t("open", { label: show(piece.citation.label), name: piece.citation.filename })}
            data-testid="files-cite"
            className={CHIP}
          >
            {show(piece.citation.label)}
          </button>
        )
      )}
    </p>
  );
}

export function CitedPages({ answer, onOpen }: { answer: Answer; onOpen: (c: Citation) => void }) {
  const t = useTranslations("dashboard.files.pageRefs");
  const show = usePageLabel();
  const pages = uniquePages(answer.citations);
  return (
    <div className="space-y-1">
      {pages.length > 0 && (
        <ul data-testid="files-citations" className="flex flex-wrap gap-1.5">
          {pages.map((c) => (
            <li key={`${c.fileId ?? c.filename}-${c.page ?? c.label}`}>
              {c.fileId && c.page ? (
                <button
                  type="button"
                  onClick={() => onOpen(c)}
                  aria-label={t("open", { label: show(c.label), name: c.filename })}
                  data-testid="files-page"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-item bg-panel px-2.5 text-xs text-foreground hover:bg-panel-hover"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                  <span className="max-w-[14rem] truncate">{c.filename}</span>
                  <span className="text-muted">— {show(c.label)}</span>
                </button>
              ) : (
                <span className="text-xs text-foreground">
                  {c.filename} — {show(c.label)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {answer.unreadPages.map((u) => (
        <p key={u.filename} data-testid="files-unread" className="text-[11px] text-warning">
          {t("unread", { name: u.filename, read: u.read, total: u.total })}
        </p>
      ))}
    </div>
  );
}

type PageState = { status: "loading" } | { status: "ready"; label: string; text: string } | { status: "missing" } | { status: "failed" };

/** One page of one file: its words, and for a PDF the file opened at it. */
export function PageView({ citation, onClose }: { citation: Citation; onClose: () => void }) {
  const t = useTranslations("dashboard.files.pageRefs");
  const show = usePageLabel();
  const [state, setState] = useState<PageState>({ status: "loading" });
  const fileId = citation.fileId!;
  const page = citation.page!;

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    fetch(`/api/files/${encodeURIComponent(fileId)}?page=${page}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!alive) return;
        if (res.ok && body?.page) setState({ status: "ready", label: String(body.page.label), text: String(body.page.text ?? "") });
        else setState(res.status === 404 ? { status: "missing" } : { status: "failed" });
      })
      .catch(() => alive && setState({ status: "failed" }));
    return () => {
      alive = false;
    };
  }, [fileId, page]);

  return (
    <section data-testid="files-page-view" aria-label={t("open", { label: show(citation.label), name: citation.filename })} className="surface-tight mt-2 space-y-2">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 break-words text-sm font-medium text-foreground">
          {citation.filename} — {show(state.status === "ready" ? state.label : citation.label)}
        </p>
        <button type="button" onClick={onClose} aria-label={t("close")} data-testid="files-page-close" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {state.status === "loading" ? (
        <p className="flex items-center gap-2 text-xs text-muted">
          <ThinkingIndicator size="sm" />
          {t("loading")}
        </p>
      ) : state.status === "ready" ? (
        state.text.trim() ? (
          <div data-testid="files-page-text" className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-body">
            {state.text}
          </div>
        ) : (
          <p className="text-xs text-muted">{t("empty")}</p>
        )
      ) : (
        <p role="alert" className="text-xs text-danger">
          {state.status === "missing" ? t("missing") : t("failed")}
        </p>
      )}
      {/\.pdf$/i.test(citation.filename) && (
        <a
          href={pdfPageHref(fileId, page)}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="files-page-pdf"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-item bg-panel px-3 text-xs text-foreground hover:bg-panel-hover"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          {t("openPdf")}
        </a>
      )}
    </section>
  );
}
