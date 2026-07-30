"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/toast-context";
import { CLASSIFIER_MODULES } from "@/lib/classifier-modules";
import { downloadJSON, todayForFilename } from "@/lib/csv";

export function ExportDataButton() {
  const supabase = createClient();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);

    const results = await Promise.all(
      CLASSIFIER_MODULES.map(async (m) => {
        const { data, error } = await supabase.from(m.table).select("*");
        return { title: m.title, data, error };
      })
    );

    setLoading(false);

    const failed = results.find((r) => r.error);
    if (failed) {
      addToast(`✗ error: ${failed.error?.message}`, "error");
      return;
    }

    const payload: Record<string, unknown[]> = {};
    for (const r of results) {
      payload[r.title] = r.data ?? [];
    }

    downloadJSON(`ai_os_export_${todayForFilename()}.json`, payload);
    addToast("✓ export downloaded");
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={loading}
      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
    >
      <Download className="h-4 w-4" /> {loading ? "Exporting..." : "Export All Data"}
    </button>
  );
}
