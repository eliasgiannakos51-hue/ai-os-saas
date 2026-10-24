"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Earth } from "@/components/brand/earth";
import { useToast } from "@/components/toast/toast-context";

/**
 * A TOOL THAT IS NOT BUILT YET, SHOWN AS A TILE ANYWAY (the owner's
 * "ALL TOOLS: ΟΛΑ ΤΑ ΤΕΤΡΑΓΩΝΑ" message, 2026-10-24, §3): every big
 * tile is visible, with a small «Σύντομα» mark; pressing one that is not
 * ready opens the SAME design every working tool has — the earth, the
 * name, the examples — except the field cannot be typed into, it says so
 * in one line, and there is a «Notify me» button instead of a press that
 * would spend credits or call a provider.
 *
 * Deliberately NOT ToolShell: that component's examples are clickable
 * and its composer is live. This is the shape that is true here — no
 * send, no charge, no provider call — so it is its own small component
 * rather than ToolShell with half its behaviour disabled by convention.
 *
 * lib/nav/all-tools.ts names which tool is waiting and why
 * (`waitingFor`); this component only draws the screen. The day a tool's
 * `ready` flips to true, its page stops rendering this and renders the
 * real tool — this component is deleted from under it, not reused with a
 * flag.
 */
export function ComingSoonShell({
  toolKey,
  name,
  examples = [],
}: {
  /** The registry's AllToolsNameKey, used only for the notify subscription. */
  toolKey: string;
  name: string;
  /** Up to three static example lines — what the tool will do, not pressable. */
  examples?: string[];
}) {
  const t = useTranslations("dashboard.comingSoon");
  const { addToast } = useToast();
  const [state, setState] = useState<"idle" | "sending" | "subscribed" | "failed">("idle");

  async function notify() {
    if (state === "sending" || state === "subscribed") return;
    setState("sending");
    try {
      const res = await fetch("/api/tools/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: toolKey }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState("subscribed");
    } catch {
      setState("failed");
      addToast(t("notifyFailed"), "error");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-2">
        <h1 className="min-w-0 break-words text-sm font-semibold text-foreground">{name}</h1>
        <span
          data-testid="coming-soon-badge"
          className="rounded-item border border-border bg-panel px-2 py-0.5 text-[11px] text-muted"
        >
          {t("badge")}
        </span>
      </div>
      <div data-testid="coming-soon" className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-5 text-center">
          <Earth variant="small" px={96} />
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">{name}</h2>
          {examples.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {examples.slice(0, 3).map((ex) => (
                <span
                  key={ex}
                  data-testid="coming-soon-example"
                  className="rounded-full bg-panel px-4 py-2 text-xs text-muted"
                >
                  {ex}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="p-4 sm:p-6">
        <div className="chat-measure space-y-3">
          <div
            aria-disabled="true"
            data-testid="coming-soon-field"
            className="min-h-[44px] rounded-field border border-border bg-panel/50 px-3 py-2 text-sm text-muted"
          >
            {t("fieldPlaceholder")}
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">{t("line")}</p>
            <button
              type="button"
              onClick={notify}
              disabled={state === "sending" || state === "subscribed"}
              data-testid="coming-soon-notify"
              className="btn-outline min-h-[44px] shrink-0 px-4 text-sm disabled:opacity-60"
            >
              {state === "subscribed" ? t("notified") : t("notify")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
