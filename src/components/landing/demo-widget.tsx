"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";

type Preview = { kind: string; title: string; parts: string[]; pitch: string };

/**
 * The landing page's one interactive element (V3 landing redesign).
 *
 * A visitor types what they want to build and gets back a real,
 * AI-generated PREVIEW — the structure of the thing, not the thing —
 * before any signup. This exists because describing the product kept
 * failing (a tester read the old page as "many LLMs in one, cheaper");
 * letting the visitor use it for ten seconds cannot be misread.
 *
 * Server-enforced limits (5/hour per IP, FAST tier, 500-char input) live
 * in api/demo/preview; this component only renders the round trip.
 */
export function DemoWidget() {
  const t = useTranslations("landing.v2.demo");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || text.trim().length < 8) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(
          data?.rateLimited ? t("rateLimited") : typeof data?.error === "string" ? data.error : t("error")
        );
      } else {
        setPreview(data.preview as Preview);
      }
    } catch {
      setError(t("error"));
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto w-full max-w-xl text-left">
      <form onSubmit={run} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder={t("placeholder")}
          className="min-h-[48px] flex-1 rounded-xl border border-border bg-panel/80 px-4 text-sm text-foreground placeholder:text-muted focus:border-orange-500/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || text.trim().length < 8}
          className="cta-amber inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-black disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          )}
          {t("button")}
        </button>
      </form>
      <p className="mt-2 text-center text-[11px] text-muted sm:text-left">{t("hint")}</p>
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}

      {preview ? (
        <div className="panel-pop-in mt-4 rounded-2xl border border-orange-500/25 bg-panel/80 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-orange-400">
            {t(`kinds.${preview.kind}` as Parameters<typeof t>[0])}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-foreground">{preview.title}</h3>
          <ul className="mt-3 space-y-1.5">
            {preview.parts.map((part, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground/85">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400/70" aria-hidden="true" />
                {part}
              </li>
            ))}
          </ul>
          {preview.pitch ? <p className="mt-3 text-xs leading-relaxed text-muted">{preview.pitch}</p> : null}
          <Link
            href="/signup?plan=free"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-400 hover:underline"
          >
            {t("buildForReal")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
