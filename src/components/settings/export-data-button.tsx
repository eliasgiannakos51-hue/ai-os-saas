"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";

/**
 * Download everything this product holds about you.
 *
 * THIS BUTTON USED TO LIE. It said "Export all" and exported the 13
 * classifier module tables — ideas, trades, leads and so on — by
 * querying them from the browser. Everything else was silently absent:
 * chat history, what the assistant had remembered about the user, their
 * uploaded documents' text, agents, websites, presentations, credit
 * history, connected accounts, login devices. Roughly a fifth of the
 * data, presented as all of it.
 *
 * That is not a missing feature, it is the specific way Article 20 gets
 * failed while appearing to be met: the request is answered, the file
 * downloads, and nobody can tell what is not in it.
 *
 * The work now happens server-side (/api/account/export) against a
 * manifest that a build gate holds level with the schema, so a table
 * added next year cannot quietly fall out. This component is just the
 * button: a plain link would have been simpler, but the request is slow
 * enough to need a pending state, and a person who clicks and sees
 * nothing happen clicks again.
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
        const data = await res.json().catch(() => null);
        addToast(data?.error || t("exportFailed"), "error");
        return;
      }

      // Streamed to a blob and clicked, rather than navigating. A
      // navigation would leave the dashboard, and the response is an
      // attachment — so the user would watch the page go blank while the
      // browser decided what to do with it.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ionexa-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoked, or the whole export stays in memory until the tab
      // closes — and these files are not small.
      URL.revokeObjectURL(url);

      addToast(t("exportDownloaded"));
    } catch {
      addToast(t("exportFailed"), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleExport}
        disabled={loading}
        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
      >
        <Download className="h-4 w-4" /> {loading ? t("exporting") : t("exportAll")}
      </button>
      {/* Said in the interface, not only inside the downloaded file. A
          person deciding whether this is their backup needs to know that
          the original uploaded documents are not in it BEFORE they rely
          on it. */}
      <p className="text-[11px] leading-relaxed text-muted">{t("exportNote")}</p>
    </div>
  );
}
