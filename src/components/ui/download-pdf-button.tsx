"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Loader2 } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";

/**
 * The one button that downloads a PDF, wherever a PDF can be downloaded.
 *
 * THREE THINGS THAT MAKE A DOWNLOAD FAIL, all of them already paid for once
 * in components/settings/export-data-button.tsx and all of them worse for a
 * PDF than for the JSON that taught them:
 *
 * 1. THE BLOB'S OWN TYPE. `res.blob()` inherits application/pdf from the
 *    response, and a browser handed a blob: URL for a type it can render
 *    WILL render it. Content-Disposition does not travel with a blob: URL,
 *    so the header on the route cannot save it. Every browser has a PDF
 *    viewer, so this is not an edge case here — it is the default outcome.
 *    Forcing application/octet-stream removes the decision.
 *
 * 2. REVOKING TOO EARLY. revokeObjectURL on the next line after click()
 *    loses a race in Safari and Firefox and navigates to a URL that no
 *    longer exists. Deferred, with the anchor.
 *
 * 3. THE FILENAME. Taken from the route's own Content-Disposition, which
 *    sanitised it, rather than rebuilt here from a title the user typed.
 *
 * AND THE ROUTE ANSWERS JSON ON FAILURE. A response that is not ok is an
 * error object, not a document; downloading it would hand somebody a file
 * called "report.pdf" containing `{"error":"not_ready"}`.
 */
/**
 * Saves a PDF response as a file, the three-trap-safe way described above.
 * Exported so the Documents dialog (components/documents/document-pdf-
 * button.tsx), which has to ask a question before it fetches, saves the
 * answer through the same code rather than a second copy of the traps.
 */
export function savePdfResponse(blobRaw: Blob, res: Response, fallbackName: string): void {
  const blob = new Blob([blobRaw], { type: "application/octet-stream" });
  const filename =
    res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `${fallbackName}.pdf`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  // If `download` is ignored (an in-app browser, an old iOS), the
  // fallback is a navigation, and it must not hand over the opener.
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 4000);
}

export function DownloadPdfButton({
  href,
  label,
  fallbackName,
  className,
}: {
  /** The PDF route, e.g. `/api/documents/<id>/pdf`. */
  href: string;
  /** Visible text. Defaults to the shared "Download PDF". */
  label?: string;
  /** Used only if the route sent no filename. */
  fallbackName: string;
  className?: string;
}) {
  const t = useTranslations("common.downloadPdf");
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(href);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        addToast(
          body?.error === "not_ready" ? t("notReady") : t("failed"),
          "error",
        );
        return;
      }

      savePdfResponse(await res.blob(), res, fallbackName);
    } catch {
      addToast(t("failed"), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={
        className ??
        "inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground disabled:opacity-60"
      }
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {loading ? t("preparing") : (label ?? t("label"))}
    </button>
  );
}
