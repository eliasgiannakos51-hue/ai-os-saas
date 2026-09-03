"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Download, Languages, X } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { useToast } from "@/components/toast/toast-context";
import { useCredits } from "@/components/credits/credits-context";
import { savePdfResponse } from "@/components/ui/download-pdf-button";
import { recordActionClasses, recordActionIconClasses } from "@/components/ui/record-action-variants";
import { LANGUAGES } from "@/lib/languages";
import { formatNumber } from "@/lib/format-number";

/**
 * "Download PDF" for a document — and the question it asks first.
 *
 * V4.6. Two reports, one control:
 *
 *   "There is no download anywhere on /dashboard/documents." There was
 *   one, inside the editor, top right — on the page you reach by opening
 *   a document. The LIST had none. This component renders in both places
 *   (the editor's header, and every card's menu), so the download is where
 *   a person looks for it.
 *
 *   "Before it downloads, ask which language. If it translates, it
 *   charges — say so before, with the amount." So the button opens a
 *   dialog rather than fetching: the document's own language (free), or a
 *   translation into one of the other nine. Choosing a language asks the
 *   server what it will cost (api/documents/[id]/pdf-estimate — the same
 *   estimator the route reserves against) and the number is on screen
 *   BEFORE the download button is enabled. Nothing is charged until that
 *   button is pressed, and the receipt comes back in a header.
 */
type Estimate =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "free"; detectedLocale: string }
  | { state: "priced"; detectedLocale: string; credits: number; bypass: boolean }
  | { state: "tooLong"; chars: number; limit: number }
  | { state: "error" };

export function DocumentPdfButton({
  documentId,
  variant = "button",
  onActivate,
}: {
  documentId: string;
  /** "button" in the editor header; "menuItem" inside a card's menu. */
  variant?: "button" | "menuItem";
  /** Menu variant: closes the menu the item lives in. */
  onActivate?: () => void;
}) {
  const t = useTranslations("dashboard.documents.pdf");
  const tPdf = useTranslations("common.downloadPdf");
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "menuItem" ? (
        <button
          type="button"
          role="menuitem"
          data-menu-item=""
          onClick={() => {
            onActivate?.();
            setOpen(true);
          }}
          className={recordActionClasses("menuItem")}
        >
          <Download className={recordActionIconClasses("menuItem")} aria-hidden="true" />
          {tPdf("label")}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          {tPdf("label")}
        </button>
      )}
      {open && <DocumentPdfDialog documentId={documentId} onClose={() => setOpen(false)} />}
    </>
  );
}

function DocumentPdfDialog({ documentId, onClose }: { documentId: string; onClose: () => void }) {
  const t = useTranslations("dashboard.documents.pdf");
  const tPdf = useTranslations("common.downloadPdf");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { addToast } = useToast();
  const { refresh: refreshCredits } = useCredits();

  const [mode, setMode] = useState<"original" | "translate">("original");
  const [target, setTarget] = useState<string>(locale);
  const [estimate, setEstimate] = useState<Estimate>({ state: "idle" });
  const [detected, setDetected] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // What language the document is in — asked once, so the "original"
  // option can name it, and again per target so the price is the price
  // for THAT language.
  useEffect(() => {
    let cancelled = false;
    const lang = mode === "translate" ? target : null;
    setEstimate({ state: "loading" });
    (async () => {
      try {
        const res = await fetch(
          `/api/documents/${documentId}/pdf-estimate${lang ? `?lang=${encodeURIComponent(lang)}` : ""}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          setEstimate({ state: "error" });
          return;
        }
        setDetected(String(data.detectedLocale));
        if (data.tooLong) {
          setEstimate({ state: "tooLong", chars: Number(data.chars), limit: Number(data.limit) });
        } else if (!data.needsTranslation) {
          setEstimate({ state: "free", detectedLocale: String(data.detectedLocale) });
        } else {
          setEstimate({
            state: "priced",
            detectedLocale: String(data.detectedLocale),
            credits: Number(data.estimatedCredits ?? 0),
            bypass: data.bypass === true,
          });
        }
      } catch {
        if (!cancelled) setEstimate({ state: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, mode, target]);

  const labelFor = (code: string | null) => LANGUAGES.find((l) => l.code === code)?.label ?? code ?? "";

  // The download is allowed only once the price (or its absence) is on
  // screen. "Working out the price…" is not a price.
  const ready =
    !downloading &&
    (estimate.state === "free" || estimate.state === "priced") &&
    (mode === "original" || estimate.state === "priced" || estimate.state === "free");

  async function download() {
    if (!ready) return;
    setDownloading(true);
    try {
      const lang = mode === "translate" ? target : null;
      const res = await fetch(`/api/documents/${documentId}/pdf${lang ? `?lang=${encodeURIComponent(lang)}` : ""}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        addToast(
          body?.error === "insufficient_credits"
            ? t("insufficient")
            : body?.error === "too_long"
              ? t("tooLong", { chars: formatNumber(Number(body.chars ?? 0), locale), limit: formatNumber(Number(body.limit ?? 0), locale) })
              : body?.error === "translation_failed" || body?.error === "not_configured"
                ? t("failed")
                : tPdf("failed"),
          "error"
        );
        return;
      }
      savePdfResponse(await res.blob(), res, "document");
      const charged = Number(res.headers.get("X-Ionexa-Credits-Charged") ?? "0");
      if (lang) {
        addToast(charged > 0 ? t("charged", { count: charged }) : t("chargedNothing"));
        refreshCredits();
      }
      onClose();
    } catch {
      addToast(tPdf("failed"), "error");
    } finally {
      setDownloading(false);
    }
  }

  const price = (() => {
    if (mode === "original") return <span className="text-emerald-300">{t("free")}</span>;
    switch (estimate.state) {
      case "loading":
      case "idle":
        return <span className="text-muted">{t("estimating")}</span>;
      case "free":
        return <span className="text-emerald-300">{t("sameLanguage")}</span>;
      case "priced":
        return estimate.bypass ? (
          <span className="text-emerald-300">{t("bypassFree")}</span>
        ) : (
          <span className="text-orange-300" data-testid="document-pdf-price">
            {t("estimate", { count: estimate.credits })}
          </span>
        );
      case "tooLong":
        return (
          <span className="text-red-300">
            {t("tooLong", { chars: formatNumber(estimate.chars, locale), limit: formatNumber(estimate.limit, locale) })}
          </span>
        );
      default:
        return <span className="text-red-300">{t("estimateFailed")}</span>;
    }
  })();

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center">
      <button type="button" aria-label={tCommon("close")} onClick={onClose} className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-pdf-title"
        className="relative w-full max-w-md rounded-2xl border border-border bg-panel p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="document-pdf-title" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Languages className="h-4 w-4 text-orange-400" aria-hidden="true" />
            {t("title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tCommon("close")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-panel-hover hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 space-y-2" role="radiogroup" aria-label={t("title")}>
          <label className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm ${mode === "original" ? "border-orange-500/50 bg-orange-500/10" : "border-border"}`}>
            <input type="radio" name="pdf-language" checked={mode === "original"} onChange={() => setMode("original")} className="accent-orange-500" />
            <span className="min-w-0 flex-1 text-foreground">
              {t("inLanguage", { language: labelFor(detected) || "…" })}
            </span>
          </label>
          <label className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm ${mode === "translate" ? "border-orange-500/50 bg-orange-500/10" : "border-border"}`}>
            <input type="radio" name="pdf-language" checked={mode === "translate"} onChange={() => setMode("translate")} className="accent-orange-500" />
            <span className="text-foreground">{t("translateTo")}</span>
            <select
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setMode("translate");
              }}
              aria-label={t("translateTo")}
              className="min-h-[36px] min-w-0 flex-1 rounded-lg border border-border bg-input px-2 text-sm text-foreground"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} lang={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* THE PRICE, BEFORE THE BUTTON. Always rendered, always above the
            action it prices. */}
        <p className="mt-4 text-xs leading-relaxed" aria-live="polite">
          {price}
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 text-xs font-medium text-muted hover:text-foreground"
          >
            {tCommon("cancel")}
          </button>
          <button
            type="button"
            onClick={download}
            disabled={!ready}
            data-testid="document-pdf-download"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-orange-500/60 px-4 text-xs font-semibold text-orange-300 transition-colors duration-150 hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {/* NOT THE FILLED ORANGE SLAB: a page has one primary action
                (scripts/tests/one-primary-action.test.mjs) and on the
                documents pages it is not this dialog's button, so this is
                the bordered accent. */}
            {/* The globe, not a spinner: a translation is a model call, and
                the product's rule (scripts/tests/globe-mark.test.mjs) is
                that a model at work is shown by the mark, everywhere. */}
            {downloading ? <ThinkingIndicator size="sm" /> : <Download className="h-3.5 w-3.5" aria-hidden="true" />}
            {downloading ? tPdf("preparing") : t("download")}
          </button>
        </div>
      </div>
    </div>
  );
}
