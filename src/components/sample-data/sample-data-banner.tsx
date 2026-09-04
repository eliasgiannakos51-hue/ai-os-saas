"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FlaskConical, X } from "lucide-react";

/**
 * "You are looking at sample data" — on every page, until it is gone.
 *
 * V4.6 #6 asks for the marker and the way out to be visible CONTINUOUSLY,
 * not tucked into a settings page. So this renders from the dashboard
 * layout rather than from Home: the sample shows up in the finance
 * charts, in the leads list and in what the chat answers with, and any
 * of those is somewhere a person can land without ever seeing Home.
 *
 * It is not dismissible. A banner you can close is a banner that is
 * absent while the thing it warns about is still true, and "why does my
 * revenue say EUR 11,920" is not a question anybody should have to
 * remember the answer to. The way to remove the notice is to remove the
 * data, which is the button.
 */
/**
 * The one button that removes the sample — used by the banner above and by
 * the Sample data card on Settings, so both call the same DELETE and
 * refresh the same way. A second copy is how one of them comes to leave
 * the marker behind.
 */
export function SampleDataClearButton() {
  const t = useTranslations("sampleData");
  const router = useRouter();
  const [clearing, setClearing] = useState(false);
  const [failed, setFailed] = useState(false);

  async function clear() {
    setClearing(true);
    setFailed(false);
    try {
      const res = await fetch("/api/sample-data", { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      // refresh(), not reload(): every dashboard page is force-dynamic, so
      // this re-runs the server components with the rows gone and the
      // banner disappears with them.
      router.refresh();
    } catch {
      setFailed(true);
      setClearing(false);
    }
  }

  return (
    <>
      {failed && <span className="text-xs text-red-300">{t("clearFailed")}</span>}
      <button
        type="button"
        onClick={clear}
        disabled={clearing}
        // Outline, not filled: the top bar already carries the one filled
        // accent control on every screen (V4.6 #4), and this is a way out
        // rather than the action of the page.
        className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-200 transition-colors duration-150 hover:bg-amber-500/10 disabled:opacity-60"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
        {clearing ? t("clearing") : t("clear")}
      </button>
    </>
  );
}

export function SampleDataBanner() {
  const t = useTranslations("sampleData");

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-500/30 bg-amber-500/[0.07] px-4 py-2 text-sm sm:px-6"
    >
      <FlaskConical className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
      <span className="min-w-0 font-medium text-amber-200">{t("banner")}</span>
      <span className="min-w-0 flex-1 text-xs text-muted">{t("bannerDetail")}</span>
      <SampleDataClearButton />
    </div>
  );
}
