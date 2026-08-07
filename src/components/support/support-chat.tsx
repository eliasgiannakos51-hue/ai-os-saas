"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, LifeBuoy } from "lucide-react";
import { SUPPORT_MAX_QUESTION_CHARS } from "@/lib/support/knowledge";

type Turn = { role: "user" | "assistant"; content: string };

/**
 * Support chat.
 *
 * The suggested questions are not decoration. A blank box invites
 * "help", which is the one question this assistant cannot answer — and
 * the ones offered are the questions the corpus genuinely covers, so the
 * first interaction succeeds instead of teaching somebody the thing is
 * useless.
 *
 * The escape hatch to a person is permanent, not a fallback shown after
 * a failure. Somebody who needs a refund should not have to discover
 * through three rounds of chat that this cannot give them one.
 */
export function SupportChat() {
  const t = useTranslations("support");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const suggestions = [t("suggest1"), t("suggest2"), t("suggest3")];

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setError("");
    setQuestion("");
    const history = turns;
    setTurns([...history, { role: "user", content: trimmed }]);

    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, history }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error || t("errorGeneric"));
        return;
      }
      setTurns((prev) => [...prev, { role: "assistant", content: data.answer }]);
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-panel/60 p-4">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
          <LifeBuoy className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          <span>{t("intro")}</span>
        </p>
      </div>

      {turns.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="rounded-full border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-fg"
              onClick={() => void ask(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      {turns.length > 0 ? (
        <div className="space-y-3">
          {turns.map((turn, i) => (
            <div
              key={i}
              className={
                turn.role === "user"
                  ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-accent/15 p-3 text-sm"
                  : "mr-auto max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-panel/60 p-3 text-sm"
              }
            >
              {/* Rendered as plain text, deliberately. The answer comes
                  from a model, and putting model output through a
                  markdown renderer that can emit links is how a support
                  reply becomes a place to put one. */}
              <p className="whitespace-pre-wrap leading-relaxed">{turn.content}</p>
            </div>
          ))}
          {busy ? (
            <div className="mr-auto flex items-center gap-2 text-xs text-muted">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              {t("thinking")}
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <input
          className="input flex-1"
          value={question}
          maxLength={SUPPORT_MAX_QUESTION_CHARS}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
        />
        <button type="submit" className="btn-primary" disabled={busy || !question.trim()}>
          {t("send")}
        </button>
      </form>

      <p className="text-[11px] leading-relaxed text-muted">
        {t("humanNote")}{" "}
        <a href="/contact" className="text-accent hover:underline">
          {t("contactLink")}
        </a>
        .
      </p>
    </div>
  );
}
