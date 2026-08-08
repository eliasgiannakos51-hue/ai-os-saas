"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/toast-context";
import { CLASSIFIER_MODULES } from "@/lib/classifier-modules";
import { downloadJSON, todayForFilename } from "@/lib/csv";

export function ExportDataButton() {
  const t = useTranslations("settings.exportData");
  const supabase = createClient();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);

    // The modules, PLUS what the AI concluded about the person.
    //
    // The learned profile is the one thing in the export the user never
    // typed — which makes it the part a data-access request is most
    // actually about. Leaving it out would mean answering "give me
    // everything you hold about me" with everything they already knew.
    // Readable here through the ordinary client because
    // user_profile_learned's select policy is scoped to auth.uid().
    const results = await Promise.all([
      ...CLASSIFIER_MODULES.map(async (m) => {
        const { data, error } = await supabase.from(m.table).select("*");
        return { title: m.title, data, error };
      }),
      (async () => {
        const { data, error } = await supabase.from("user_profile_learned").select("*");
        return { title: "AI profile (what Ionexa learned about you)", data, error };
      })(),
    ]);

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

    downloadJSON(`ionexa_export_${todayForFilename()}.json`, payload);
    addToast(t("exportDownloaded"));
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
