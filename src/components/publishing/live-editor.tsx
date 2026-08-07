"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { useCredits } from "@/components/credits/credits-context";
import { getErrorMessage } from "@/lib/get-error-message";

/**
 * The split-view live editor for one published site (V3 Task 12).
 *
 * Left pane is the page as it is live RIGHT NOW (an iframe of the real
 * URL). The user describes a change and previews it: the right pane fills
 * with the proposed result (srcDoc, sandboxed, never yet live). Approving
 * writes it live in one call — the security scan has already run, and
 * runs again on the exact bytes at apply time server-side.
 *
 * The preview is the charged step (the AI ran); approving costs nothing
 * more. Declining costs nothing to undo — nothing went live.
 */
export function LiveEditor({ siteId, liveUrl }: { siteId: string; liveUrl: string }) {
  const t = useTranslations("dashboard.publishing.liveEdit");
  const router = useRouter();
  const { addToast } = useToast();
  const { reportUsage } = useCredits();

  const [changeRequest, setChangeRequest] = useState("");
  const [proposed, setProposed] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);

  const preview = async () => {
    if (previewing || changeRequest.trim().length < 3) return;
    setPreviewing(true);
    setProposed(null);
    try {
      const res = await fetch(`/api/published/${siteId}/live-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview", changeRequest: changeRequest.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        addToast(typeof data?.error === "string" ? data.error : t("previewError"), "error");
      } else {
        setProposed(data.html as string);
        void reportUsage(data);
      }
    } catch (err) {
      addToast(getErrorMessage(err, t("previewError")), "error");
    }
    setPreviewing(false);
  };

  const apply = async () => {
    if (applying || !proposed) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/published/${siteId}/live-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "apply", changeRequest: changeRequest.trim(), html: proposed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        addToast(typeof data?.error === "string" ? data.error : t("applyError"), "error");
      } else {
        addToast(t("applied"));
        setProposed(null);
        setChangeRequest("");
        router.refresh();
      }
    } catch (err) {
      addToast(getErrorMessage(err, t("applyError")), "error");
    }
    setApplying(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={changeRequest}
          onChange={(e) => setChangeRequest(e.target.value)}
          maxLength={20000}
          placeholder={t("placeholder")}
          className="min-h-[44px] flex-1 rounded-xl border border-border bg-input px-3 text-sm text-foreground placeholder:text-muted focus:border-orange-500/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={preview}
          disabled={previewing || changeRequest.trim().length < 3}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:border-orange-500 hover:text-orange-400 disabled:opacity-40"
        >
          {previewing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          )}
          {t("previewButton")}
        </button>
      </div>

      {/* Split view: current live | proposed. Stacks on mobile. */}
      <div className="grid gap-3 lg:grid-cols-2">
        <figure className="overflow-hidden rounded-xl border border-border">
          <figcaption className="border-b border-border bg-panel px-3 py-1.5 text-[11px] font-medium text-muted">
            {t("currentLabel")}
          </figcaption>
          <iframe
            src={liveUrl}
            title={t("currentLabel")}
            className="h-64 w-full bg-white"
            sandbox="allow-scripts allow-same-origin"
          />
        </figure>
        <figure className="overflow-hidden rounded-xl border border-orange-500/30">
          <figcaption className="flex items-center justify-between border-b border-orange-500/30 bg-orange-500/[0.06] px-3 py-1.5 text-[11px] font-medium text-orange-400">
            {t("proposedLabel")}
            {proposed ? <span className="text-muted">{t("notLiveYet")}</span> : null}
          </figcaption>
          {proposed ? (
            <iframe
              srcDoc={proposed}
              title={t("proposedLabel")}
              className="h-64 w-full bg-white"
              // No allow-same-origin: proposed HTML is model output not yet
              // vetted for THIS origin, so it renders fully isolated.
              sandbox="allow-scripts"
            />
          ) : (
            <div className="flex h-64 items-center justify-center px-4 text-center text-xs text-muted">
              {t("proposedEmpty")}
            </div>
          )}
        </figure>
      </div>

      {proposed ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={apply}
            disabled={applying}
            className="cta-amber inline-flex min-h-[40px] items-center gap-2 rounded-xl px-5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {applying ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            {t("applyButton")}
          </button>
          <button
            type="button"
            onClick={() => setProposed(null)}
            disabled={applying}
            className="inline-flex min-h-[40px] items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            {t("discard")}
          </button>
          <span className="text-[11px] text-muted">{t("applyHint")}</span>
        </div>
      ) : null}
    </div>
  );
}
