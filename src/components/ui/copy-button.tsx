"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/toast/toast-context";

/**
 * Copy something, and say so.
 *
 * WHY THIS IS A COMPONENT. Copying was hand-rolled twice
 * (publish-control, published-sites-list) and absent everywhere it was
 * most needed — an AI answer you cannot get out of the page is an answer
 * you retype. Two copies of a pattern is where the third one starts
 * disagreeing about the details, and the details here are the whole
 * feature:
 *
 *   · CONFIRMATION. `navigator.clipboard.writeText` resolves silently.
 *     Without a visible change the user presses again, and again, with no
 *     way to tell a working button from a dead one. The label becomes
 *     "Copied ✓" for two seconds.
 *   · FAILURE IS REAL. The Clipboard API is unavailable on insecure
 *     origins and can be denied by permission policy — an iframe, a
 *     hardened browser, plain http on a phone. A promise that rejects
 *     into an empty catch is a button that does nothing forever. It
 *     falls back to the old execCommand path, and if that fails too it
 *     says so out loud rather than pretending.
 *   · ANNOUNCED. The icon swap is invisible to a screen reader, so the
 *     confirmation is also text in an aria-live region.
 *
 * The timer is cleared on unmount: a copy button inside a list row that
 * is deleted two seconds later would otherwise set state on a component
 * that is gone.
 */
export function CopyButton({
  text,
  label,
  variant = "button",
  className,
  "data-testid": testId,
}: {
  /** What lands on the clipboard. A function for text that is expensive
   *  to build, or has to be fetched — it runs on press, not on render. */
  text: string | (() => string | Promise<string>);
  /** What the button says before it is pressed. Falls back to "Copy". */
  label?: string;
  /** `icon` is the square, label-less form for dense rows. */
  variant?: "button" | "icon";
  className?: string;
  "data-testid"?: string;
}) {
  const t = useTranslations("common");
  const { addToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function copy() {
    if (busy) return;
    setBusy(true);
    try {
      const value = typeof text === "function" ? await text() : text;
      if (!value) {
        addToast(t("copyNothing"), "error");
        return;
      }
      const ok = await writeToClipboard(value);
      if (!ok) {
        addToast(t("copyFailed"), "error");
        return;
      }
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast(t("copyFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  const shown = label ?? t("copy");
  const Icon = copied ? Check : Copy;

  return (
    <>
      <button
        type="button"
        onClick={() => void copy()}
        disabled={busy}
        data-testid={testId}
        // The accessible name carries the same two states as the visible
        // one, because in the icon form there is no visible one.
        aria-label={copied ? t("copied") : shown}
        className={
          className ??
          (variant === "icon"
            ? `inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground disabled:opacity-50 ${
                copied ? "text-emerald-400" : ""
              }`
            : `inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] transition-colors duration-150 hover:border-orange-500/50 hover:text-orange-300 disabled:opacity-50 ${
                copied ? "border-emerald-500/50 text-emerald-400" : "text-muted"
              }`)
        }
      >
        {/* No icon next to the confirmation in the labelled form: the
            string is "Copied ✓" — the tick is already in the words, and
            a Check beside it renders "✓ Copied ✓". The icon form keeps
            it, because there it is the only thing that changes. */}
        {(variant === "icon" || !copied) && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        {variant === "button" && <span>{copied ? t("copied") : shown}</span>}
      </button>
      {/* Polite, and outside the button: a screen reader gets the
          confirmation even in the icon form, and does not get it
          re-announced while the user is still on the button. */}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? t("copied") : ""}
      </span>
    </>
  );
}

/**
 * The clipboard, with the fallback the modern API needs.
 *
 * `navigator.clipboard` is undefined outside a secure context and its
 * write can be refused by permissions policy. `document.execCommand`
 * ("copy") is deprecated and still the only thing that works in those
 * cases — so it is tried second, and a false return is a real failure
 * the caller must surface rather than swallow.
 *
 * Exported because not every copy can be a button: a copy that lives in
 * a "..." menu is an onSelect callback, and a second implementation of
 * the fallback is a second thing that stops working on http.
 */
export async function writeToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through — a rejection here is exactly the case the fallback exists for.
  }
  try {
    const area = document.createElement("textarea");
    area.value = value;
    // Off-screen rather than hidden: display:none and visibility:hidden
    // both make the selection fail, which is the classic way this
    // fallback silently stops working.
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
