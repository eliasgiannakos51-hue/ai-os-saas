"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Languages, X } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { useCredits } from "@/components/credits/credits-context";
import { LANGUAGES } from "@/lib/languages";
import { formatNumber } from "@/lib/format-number";

/**
 * «Μετάφραση» on a site or a document (MASTER 16, package 28), behind the
 * switch "translate" — the page decides whether to draw it.
 *
 * The same order as the PDF dialog beside it (document-pdf-button.tsx):
 * choose the language, see the price from the same estimator the server
 * holds against (GET api/translate), and only then press. What it makes is
 * a NEW copy in the other language; the original is not touched, and the
 * dialog says so before anything is pressed.
 */
export type TranslateResult = { kind: "site" | "document"; id: string; name: string; kept: number; record?: Record<string, unknown> };

type Price =
  | { state: "loading" }
  | { state: "priced"; credits: number; bypass: boolean }
  | { state: "refused"; code: string; chars: number; limit: number | null }
  | { state: "error" };

type Run = { state: "idle" } | { state: "running" } | { state: "done"; result: TranslateResult; charged: number } | { state: "failed"; message: string };

export function TranslateButton({
  kind,
  id,
  variant = "action",
  openHref,
  onDone,
  onOpen,
  actionClassName = "",
}: {
  kind: "site" | "document";
  id: string;
  /** "action": the icon among a shell's actions; "button": a bordered button with its word. */
  variant?: "action" | "button";
  /** The shell's own ACTION class (components/shell/tool-shell.tsx), handed in
   *  rather than imported, so a page without the shell does not load it. */
  actionClassName?: string;
  /** Where the copy opens, when the page leaves the screen to open it. */
  openHref?: (id: string) => string;
  /** Told of the copy as soon as it exists, so the page can list it. */
  onDone?: (result: TranslateResult) => void;
  /** «Άνοιξέ το» opening the copy in place, where the page can. */
  onOpen?: (result: TranslateResult) => void;
}) {
  const t = useTranslations("dashboard.translate");
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "action" ? (
        <button type="button" onClick={() => setOpen(true)} aria-label={t("button")} title={t("button")} data-testid="translate-open" className={actionClassName}>
          <Languages className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="translate-open"
          className="btn-outline text-xs"
        >
          <Languages className="h-3.5 w-3.5" aria-hidden="true" />
          {t("button")}
        </button>
      )}
      {open && <TranslateDialog kind={kind} id={id} openHref={openHref} onDone={onDone} onOpen={onOpen} onClose={() => setOpen(false)} />}
    </>
  );
}

function TranslateDialog({
  kind,
  id,
  openHref,
  onDone,
  onOpen,
  onClose,
}: {
  kind: "site" | "document";
  id: string;
  openHref?: (id: string) => string;
  onDone?: (result: TranslateResult) => void;
  onOpen?: (result: TranslateResult) => void;
  onClose: () => void;
}) {
  const t = useTranslations("dashboard.translate");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { refresh: refreshCredits } = useCredits();
  const [target, setTarget] = useState("en");
  const [price, setPrice] = useState<Price>({ state: "loading" });
  const [run, setRun] = useState<Run>({ state: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPrice({ state: "loading" });
    (async () => {
      try {
        const res = await fetch(`/api/translate?kind=${kind}&id=${encodeURIComponent(id)}&target=${encodeURIComponent(target)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.ok) return setPrice({ state: "error" });
        if (data.refused) return setPrice({ state: "refused", code: String(data.refused), chars: Number(data.chars ?? 0), limit: data.limit === null ? null : Number(data.limit) });
        setPrice({ state: "priced", credits: Number(data.estimatedCredits ?? 0), bypass: data.bypass === true });
      } catch {
        if (!cancelled) setPrice({ state: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, id, target]);

  async function translate() {
    if (price.state !== "priced" || run.state === "running") return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRun({ state: "running" });
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, target }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      refreshCredits();
      if (!res.ok || !data?.ok) {
        const code = String(data?.code ?? "");
        const message =
          code === "insufficient_credits"
            ? t("insufficient")
            : code === "daily_limit"
              ? t("dailyLimit")
              : code === "not_included"
                ? t("notIncluded")
                : code === "unusable"
                  ? t("unusable")
                  : code === "stopped"
                    ? t("stopped")
                    : t("failed");
        return setRun({ state: "failed", message });
      }
      const result: TranslateResult = { kind, id: String(data.id), name: String(data.name ?? ""), kept: Number(data.kept ?? 0), record: data.record ?? undefined };
      setRun({ state: "done", result, charged: Number(data.creditsCharged ?? 0) });
      onDone?.(result);
    } catch {
      setRun({ state: "failed", message: controller.signal.aborted ? t("stopped") : t("failed") });
    } finally {
      abortRef.current = null;
    }
  }

  const priceLine = (() => {
    switch (price.state) {
      case "loading":
        return <span className="text-muted">{t("estimating")}</span>;
      case "priced":
        return price.bypass ? (
          <span className="text-success">{t("bypassFree")}</span>
        ) : (
          <span className="text-foreground" data-testid="translate-price">
            {t("estimate", { count: price.credits })}
          </span>
        );
      case "refused":
        return (
          <span className="text-danger" data-testid="translate-refused">
            {price.code === "same_language"
              ? t("sameLanguage")
              : price.code === "too_long"
                ? t("tooLong", { chars: formatNumber(price.chars, locale), limit: formatNumber(price.limit ?? 0, locale) })
                : t("nothing")}
          </span>
        );
      default:
        return <span className="text-danger">{t("estimateFailed")}</span>;
    }
  })();

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center">
      <button type="button" aria-label={tCommon("close")} onClick={run.state === "running" ? undefined : onClose} className="fixed inset-0 bg-background/60 backdrop-blur-sm" />
      <div role="dialog" aria-modal="true" aria-labelledby="translate-title" data-testid="translate-dialog" className="relative w-full max-w-md surface">
        <div className="flex items-start justify-between gap-3">
          <h2 id="translate-title" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Languages className="h-4 w-4 text-foreground" aria-hidden="true" />
            {t("title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={run.state === "running"}
            aria-label={tCommon("close")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {run.state === "done" ? (
          <div className="mt-4 space-y-2 text-sm" data-testid="translate-done" aria-live="polite">
            <p className="text-foreground">{t("done", { name: run.result.name })}</p>
            {run.result.kept > 0 && <p className="text-xs text-warning" data-testid="translate-kept">{t("kept", { count: run.result.kept })}</p>}
            <p className="text-xs text-muted">{run.charged > 0 ? t("charged", { count: run.charged }) : t("chargedNothing")}</p>
            <div className="flex justify-end gap-2 pt-2">
              {openHref ? (
                <Link href={openHref(run.result.id)} data-testid="translate-open-copy" className="btn-outline text-xs font-semibold">
                  {t("open")}
                </Link>
              ) : onOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    if (run.state === "done") onOpen(run.result);
                    onClose();
                  }}
                  data-testid="translate-open-copy"
                  className="btn-outline text-xs font-semibold"
                >
                  {t("open")}
                </button>
              ) : null}
              <button type="button" onClick={onClose} className="btn-outline text-xs text-muted">
                {tCommon("close")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="mt-4 flex min-h-[44px] items-center gap-3 text-sm">
              <span className="text-foreground">{t("language")}</span>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                disabled={run.state === "running"}
                data-testid="translate-target"
                className="input min-w-0 flex-1"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code} lang={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-3 text-xs text-muted">{kind === "site" ? t("copyNoteSite") : t("copyNoteDocument")}</p>
            {/* THE PRICE, BEFORE THE BUTTON, always above the action it prices. */}
            <p className="mt-3 text-xs leading-relaxed" aria-live="polite">
              {priceLine}
            </p>
            {run.state === "failed" && (
              <p className="mt-2 text-xs text-danger" role="alert" data-testid="translate-failed">
                {run.message}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => (run.state === "running" ? abortRef.current?.abort() : onClose())}
                className="btn-outline text-xs text-muted"
              >
                {run.state === "running" ? t("stop") : tCommon("cancel")}
              </button>
              {/* An outline, not the filled slab: the page's one primary
                  action is not this dialog's
                  (scripts/tests/one-primary-action.test.mjs). */}
              <button
                type="button"
                onClick={() => void translate()}
                disabled={price.state !== "priced" || run.state === "running"}
                data-testid="translate-go"
                className="btn-outline text-xs font-semibold disabled:cursor-not-allowed"
              >
                {run.state === "running" ? <ThinkingIndicator size="sm" /> : <Languages className="h-3.5 w-3.5" aria-hidden="true" />}
                {run.state === "running" ? t("running") : t("go")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
