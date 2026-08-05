"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { getErrorMessage } from "@/lib/get-error-message";
import { readNdjsonStream } from "@/lib/ndjson-stream";
import { MessageContent } from "@/components/chat/message-content";
import { useCredits } from "@/components/credits/credits-context";

type Turn = { id: number; role: "user" | "assistant"; content: string };

let localIdCounter = 0;
function nextLocalId(): number {
  localIdCounter += 1;
  return localIdCounter;
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-border bg-panel px-4 py-3.5">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
    </div>
  );
}

// Ephemeral, per-record mini-chat — every open/close cycle starts fresh
// (nothing is persisted server-side, unlike Ionexa Chat's saved
// conversations), so the whole record row's data can ride along as system
// prompt context on every message without ever needing a conversation id.
export function AskAiModal({
  open,
  onClose,
  moduleSlug,
  moduleTitle,
  recordId,
  recordHeadline,
}: {
  open: boolean;
  onClose: () => void;
  moduleSlug: string;
  moduleTitle: string;
  recordId: string;
  recordHeadline: string;
}) {
  const t = useTranslations("askAi");
  const tCommon = useTranslations("common");
  const { refresh: refreshCredits } = useCredits();
  const [messages, setMessages] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimitNotice, setIsRateLimitNotice] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => textareaRef.current?.focus());

    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  function handleTextareaInput(e: ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setError(null);
    setIsRateLimitNotice(false);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { id: nextLocalId(), role: "user", content: text }]);
    setSending(true);
    setStreamingText(null);

    try {
      const res = await fetch("/api/records/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleSlug, recordId, message: text, history }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/x-ndjson") || !res.body) {
        const data = await res.json().catch(() => null);
        if (data?.rateLimited) {
          setIsRateLimitNotice(true);
          setError(data.message);
        } else {
          setError(getErrorMessage(data?.error, "Something went wrong."));
        }
        return;
      }

      let accumulatedText = "";
      let streamError: string | null = null;

      // Never throws — a dropped connection must not delete the answer
      // the user already watched stream in. See lib/ndjson-stream.ts.
      const { interrupted } = await readNdjsonStream(res.body, (event) => {
        if (event.type === "delta") {
          if (typeof event.text === "string") {
            accumulatedText += event.text;
            setStreamingText(accumulatedText);
          }
        } else if (event.type === "error") {
          streamError = typeof event.error === "string" ? event.error : "Something went wrong.";
        }
      });

      if (accumulatedText) {
        setMessages((m) => [...m, { id: nextLocalId(), role: "assistant", content: accumulatedText }]);
      }

      if (streamError) {
        setError(streamError);
      } else if (interrupted) {
        setError(accumulatedText ? t("streamInterruptedPartial") : t("streamInterrupted"));
      }

      void refreshCredits();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setStreamingText(null);
      setSending(false);
    }
  }

  function handleTextareaKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as unknown as FormEvent);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center px-4 pb-4 sm:items-center sm:pb-0">
      <div onClick={onClose} className="fixed inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("title", { title: moduleTitle })}
        className="relative flex h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-panel shadow-[0_0_0_1px_rgba(249,115,22,0.05)] sm:h-[640px]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400"
              aria-hidden="true"
            >
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-foreground">
                {t("title", { title: moduleTitle })}
              </h2>
              <p className="truncate text-xs text-muted">{recordHeadline}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {messages.length === 0 && !sending ? (
            <p className="text-sm text-muted">{t("emptyState")}</p>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) =>
                msg.role === "user" ? (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-orange-500 px-4 py-2.5 text-sm text-black">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div key={msg.id} className="flex items-start gap-2">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-400"
                      aria-hidden="true"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                    </span>
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-input px-4 py-2.5 text-foreground/90">
                      <MessageContent content={msg.content} />
                    </div>
                  </div>
                )
              )}

              {sending && (
                <div className="flex items-start gap-2">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-400"
                    aria-hidden="true"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                  </span>
                  {streamingText !== null ? (
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-input px-4 py-2.5 text-foreground/90">
                      <MessageContent content={streamingText} />
                    </div>
                  ) : (
                    <TypingDots />
                  )}
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="border-t border-border p-4">
          {error && (
            <p
              className={`mb-3 rounded-xl border px-3 py-2 text-xs ${
                isRateLimitNotice
                  ? "border-orange-900/50 bg-orange-500/5 text-orange-400"
                  : "border-red-900 bg-red-950/40 text-red-400"
              }`}
            >
              {error}
            </p>
          )}
          <form onSubmit={handleSend}>
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleTextareaInput}
                onKeyDown={handleTextareaKeyDown}
                placeholder={t("placeholder")}
                rows={1}
                className="max-h-32 min-h-[48px] w-full resize-none overflow-y-auto rounded-2xl border border-border bg-background px-4 py-3 pr-12 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted focus:border-orange-500/60"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                aria-label={t("send")}
                className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.4)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                {sending ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                ) : (
                  <ArrowUp className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
