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
      const blob = await res.blob();
      const filename =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        `ionexa_export_${new Date().toISOString().slice(0, 10)}.json`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

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
      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
    >
      <Download className="h-4 w-4" /> {loading ? t("exporting") : t("exportAll")}
    </button>
  );
}
