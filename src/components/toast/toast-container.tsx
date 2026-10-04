"use client";

import { useTranslations } from "next-intl";
import { useToast } from "@/components/toast/toast-context";

export function ToastContainer() {
  const t = useTranslations("common");
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  // TOP, BELOW THE BAR — not bottom-end, where every composer in the app
  // keeps its Send button. Measured 2026-10-03 on a 390px phone
  // (scripts/tests/design-part2.prodtest.mjs): an achievement toast sat
  // exactly on Send, so the tap dismissed the toast and the message never
  // left. At 1440px the old box (x 1136–1424) covered the chat's Send
  // (x 1234–1278) too; it only had not happened during a test yet.
  return (
    <div className="fixed end-4 top-20 z-[60] flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          tabIndex={0}
          onClick={() => dismissToast(toast.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              dismissToast(toast.id);
            }
          }}
          aria-label={t("dismissToastAria", { message: toast.message })}
          // `success-flash` (globals.css) is the one-shot green-into-amber
          // ring pulse on non-error toasts — the app's confirmation
          // moment. Errors deliberately don't get it: a success cue on a
          // failure message is exactly the wrong signal.
          className={`cursor-pointer rounded-md border px-3 py-2 text-xs  transition-all duration-200 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/70 ${
            toast.leaving
              ? "translate-y-1 opacity-0"
              : "animate-fade-in translate-y-0 opacity-100"
          } ${toast.type === "error" || toast.leaving ? "" : "success-flash"} ${
            toast.type === "error"
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-border bg-background/90 text-foreground"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
