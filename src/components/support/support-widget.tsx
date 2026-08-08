"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LifeBuoy, X, Send, Loader2, Mail, BookOpen } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { getErrorMessage } from "@/lib/get-error-message";
import { MAX_QUESTION_CHARS } from "@/lib/support/limits";

// The support widget.
//
// It answers questions about Ionexa from the help corpus and NOTHING else.
// When the server declines to answer — because no article covers it, or
// because the grounding check caught a number that was not in the source
// material — this shows the refusal as a refusal, with a button that sends
// the question to a person. It never paraphrases a rejected answer into
// something softer, and it never shows a partial one.
//
// Answers carry the articles they came from, so "where did that come
// from?" has an answer that is not "the AI said so".

type Turn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; sources: { slug: string; title: string }[] }
  | { role: "declined"; reason: string; question: string; sent: boolean };

export function SupportWidget() {
  const t = useTranslations("support");
  const locale = useLocale();
  const { addToast } = useToast();

  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [asking, setAsking] = useState(false);
  const [sendingIndex, setSendingIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, asking]);

  // Escape closes it, like every other overlay in the app.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || asking) return;

    setTurns((prev) => [...prev, { role: "user", text }]);
    setQuestion("");
    setAsking(true);
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, language: locale }),
      });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("error"), "error");
        return;
      }
      if (data.escalate) {
        setTurns((prev) => [
          ...prev,
          { role: "declined", reason: String(data.reason ?? "no_answer"), question: text, sent: false },
        ]);
        return;
      }
      setTurns((prev) => [
        ...prev,
        { role: "assistant", text: String(data.answer ?? ""), sources: data.sources ?? [] },
      ]);
    } catch (err) {
      addToast(getErrorMessage(err, t("error")), "error");
    } finally {
      setAsking(false);
    }
  }

  async function escalate(index: number, turn: Extract<Turn, { role: "declined" }>) {
    setSendingIndex(index);
    try {
      const response = await fetch("/api/support/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: turn.question, reason: turn.reason }),
      });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("error"), "error");
        return;
      }
      setTurns((prev) => prev.map((v, i) => (i === index && v.role === "declined" ? { ...v, sent: true } : v)));
    } catch (err) {
      addToast(getErrorMessage(err, t("error")), "error");
    } finally {
      setSendingIndex(null);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("open")}
        title={t("open")}
        className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-panel text-orange-400 shadow-lg transition-colors duration-150 hover:border-orange-500/50 hover:text-orange-300"
      >
        <LifeBuoy className="h-5 w-5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label={t("title")}
      className="fixed bottom-4 right-4 z-40 flex max-h-[min(32rem,calc(100vh-2rem))] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl sm:w-96"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <LifeBuoy className="h-4 w-4 text-orange-400" aria-hidden="true" />
          {t("title")}
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t("close")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {turns.length === 0 && (
          <p className="text-xs leading-relaxed text-muted">{t("intro")}</p>
        )}

        {turns.map((turn, index) => {
          if (turn.role === "user") {
            return (
              <p
                key={index}
                className="ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-orange-500/15 px-3 py-2 text-xs leading-relaxed text-foreground"
              >
                {turn.text}
              </p>
            );
          }
          if (turn.role === "assistant") {
            return (
              <div key={index} className="max-w-[92%] space-y-1.5">
                <p className="rounded-xl rounded-bl-sm bg-input px-3 py-2 text-xs leading-relaxed text-foreground">
                  {turn.text}
                </p>
                {turn.sources.length > 0 && (
                  <p className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
                    <BookOpen className="h-3 w-3" aria-hidden="true" />
                    {t("from")} {turn.sources.map((s) => s.title).join(" · ")}
                  </p>
                )}
              </div>
            );
          }
          return (
            <div
              key={index}
              className="max-w-[92%] space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5"
            >
              {/* The refusal, said plainly. Not "I'm not sure, but maybe…"
                  — the whole reason this path exists is that a hedged guess
                  is the thing being avoided. */}
              <p className="text-xs leading-relaxed text-foreground">{t("declined")}</p>
              {turn.sent ? (
                <p className="text-[11px] text-emerald-400">{t("sent")}</p>
              ) : (
                <button
                  type="button"
                  onClick={() => void escalate(index, turn)}
                  disabled={sendingIndex === index}
                  className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-border bg-panel px-3 py-1.5 text-[11px] font-medium text-foreground transition-colors duration-150 hover:border-orange-500/50 disabled:opacity-60"
                >
                  <Mail className="h-3 w-3" aria-hidden="true" />
                  {sendingIndex === index ? t("sending") : t("sendToHuman")}
                </button>
              )}
            </div>
          );
        })}

        {asking && (
          <p className="flex items-center gap-2 text-xs text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {t("thinking")}
          </p>
        )}
      </div>

      <form onSubmit={ask} className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2.5">
        <input
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={MAX_QUESTION_CHARS}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          className="min-w-0 flex-1 rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground outline-none transition-colors duration-150 focus:border-orange-500"
        />
        <button
          type="submit"
          disabled={asking || !question.trim()}
          aria-label={t("send")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500 text-black transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
