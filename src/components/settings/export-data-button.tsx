"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";

/**
 * GDPR Article 15 — download everything we hold about you.
 *
 * This used to query the 13 CLASSIFIER_MODULES tables straight from the
 * browser. Two things were wrong with that, beyond the ~50 tables it
 * never touched: RLS returns an empty array rather than an error for a
 * table the client cannot read, so a permissions failure was
 * indistinguishable from "you have no data" — and the list it read
 * exists to tell "Create Anything" which module to file an entry into,
 * which is not a statement about personal data and had no reason to
 * track the schema.
 *
 * The route (api/account/export) builds from the single registry in
 * lib/gdpr/user-data-registry.ts, which a build-gate test keeps in sync
 * with the schema.
 */
export function ExportDataButton() {
  const t = useTranslations("settings.exportData");
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) {
        // The route replies JSON on failure and a file on success, so a
        // failed export says why instead of downloading an error page.
        const body = await res.json().catch(() => null);
        addToast(body?.error ?? t("exportFailed"), "error");
        return;
      }

      // Streamed to a blob rather than parsed: a heavy account's export
      // is large, and JSON.parse-ing it only to re-serialize it wastes
      // memory on the user's device for no benefit.
      const filename =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        `ionexa_export_${new Date().toISOString().slice(0, 10)}.json`;

      // "Export All Data opens in a text editor instead of downloading."
      //
      // The server side was never the problem: the route already sends
      // Content-Disposition: attachment. The two things that make a blob
      // download open inline instead are both here.
      //
      // 1. THE BLOB'S OWN TYPE. res.blob() inherits application/json from
      //    the response, and a browser handed a blob: URL it knows how to
      //    render will render it — Content-Disposition does not travel
      //    with a blob: URL, so the header cannot save it. Forcing
      //    application/octet-stream removes the "I can display this"
      //    decision entirely.
      //
      // 2. REVOKING TOO EARLY. revokeObjectURL ran on the very next line
      //    after click(), synchronously. Chrome usually starts the
      //    download first; Safari and Firefox can lose the race and end up
      //    navigating to a URL that no longer exists. The revoke is now
      //    deferred, and the anchor is removed with it.
      const raw = await res.blob();
      const blob = new Blob([raw], { type: "application/octet-stream" });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      // rel=noopener: if `download` is ignored (an in-app browser, an old
      // iOS), the fallback is a navigation, and it must not hand the
      // opener reference to whatever renders it.
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      // Long enough for every engine to have taken the blob, short enough
      // that nothing meaningful is retained.
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 30_000);

      addToast(t("exportDownloaded"));
    } catch {
      addToast(t("exportFailed"), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={loading}
      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Download className="h-4 w-4" /> {loading ? t("exporting") : t("exportAll")}
    </button>
  );
}
