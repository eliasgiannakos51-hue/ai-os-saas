"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { MessageContent } from "@/components/chat/message-content";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { useCredits } from "@/components/credits/credits-context";
import { getErrorMessage } from "@/lib/get-error-message";
import { readNdjsonStream } from "@/lib/ndjson-stream";

type StudioMessage = { id: number; role: "user" | "assistant"; content: string };

let messageIdCounter = 0;

/**
 * The Create Studio workspace's "AI Chat" tab.
 *
 * A real conversation on the real /api/chat endpoint — same streaming
 * protocol, same credit accounting, same free-message allowance as the
 * Chat page. The only difference is the first message carries a line of
 * context about what was just created, so "make the hero section
 * shorter" has something to refer to without the user re-explaining it.
 *
 * It deliberately keeps its own conversation id rather than joining an
 * existing thread: this conversation is about this creation.
 */
export function StudioChat({ context }: { context: string }) {
  const t = useTranslations("dashboard.createStudio");
  const { refresh: refreshCredits } = useCredits();
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    messageIdCounter += 1;
    setMessages((prev) => [...prev, { id: messageIdCounter, role: "user", content: text }]);
    setInput("");
    setSending(true);
    setError(null);
    setStreaming("");

    // The context line rides along with the FIRST message only — after
    // that the conversation itself carries the history server-side, and
    // re-sending it every turn would just pay for the same tokens again.
    const payload = conversationIdRef.current
      ? { conversationId: conversationIdRef.current, message: text }
      : { message: `${context}\n\n${text}` };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/x-ndjson") || !res.body) {
        const data = await res.json().catch(() => null);
        setError(getErrorMessage(data?.error ?? data?.message, t("chatFailed")));
        return;
      }

      let accumulated = "";
      let streamError: string | null = null;

      // Never throws — a dropped connection must not delete the answer
      // the user already watched stream in. See lib/ndjson-stream.ts.
      const { interrupted } = await readNdjsonStream(res.body, (event) => {
        if (event.type === "meta") {
          conversationIdRef.current =
            (event.conversationId as string | undefined) ?? conversationIdRef.current;
        } else if (event.type === "delta") {
          if (typeof event.text === "string") {
            accumulated += event.text;
            setStreaming(accumulated);
          }
        } else if (event.type === "error") {
          streamError = typeof event.error === "string" ? event.error : t("chatFailed");
        }
      });

      void refreshCredits();

      if (accumulated) {
        messageIdCounter += 1;
        setMessages((prev) => [
          ...prev,
          { id: messageIdCounter, role: "assistant", content: accumulated },
        ]);
      }
      if (streamError) setError(streamError);
      else if (interrupted) {
        setError(accumulated ? t("streamInterruptedPartial") : t("streamInterrupted"));
      }
    } catch {
      setError(t("chatNetworkError"));
    } finally {
      setStreaming("");
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-[420px] min-h-[120px] space-y-3 overflow-y-auto">
        {messages.length === 0 && !streaming ? (
          <p className="text-sm text-muted">{t("chatEmpty")}</p>
        ) : (
          messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-orange-500 px-3.5 py-2 text-sm text-black">
                  {message.content}
                </p>
              </div>
            ) : (
              <div key={message.id} className="max-w-[95%] text-sm">
                <MessageContent content={message.content} />
              </div>
            )
          )
        )}
        {streaming && (
          <div className="max-w-[95%] text-sm">
            <MessageContent content={streaming} />
          </div>
        )}
        {sending && !streaming && <ThinkingIndicator label={t("chatThinking")} />}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("chatPlaceholder")}
          aria-label={t("chatPlaceholder")}
          className="input pr-12"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          aria-label={t("chatSend")}
          className="absolute bottom-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-black transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
