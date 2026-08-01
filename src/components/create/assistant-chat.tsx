"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowUp, CheckCircle2, AlertCircle, XCircle, Sparkles } from "lucide-react";
import { NAV_ITEMS } from "@/lib/modules";
import { useCreateAnything, type CreateResult } from "@/lib/use-create-anything";
import { useSmartSuggestions } from "@/lib/use-smart-suggestions";
import { SmartSuggestions } from "@/components/create/smart-suggestions";

type Turn = { id: number; userMessage: string; result: CreateResult };

let turnIdCounter = 0;

// Full chat-thread UI for the dedicated /dashboard/create page. Each
// submission accumulates as a turn in local state — there's no backend
// conversation history to restore (create_requests only logs a timestamp
// for rate-limiting, not message content), so the thread is scoped to the
// current visit, same as the underlying feature always worked.
export function AssistantChat({ userInitial }: { userInitial: string }) {
  const { submit, loading } = useCreateAnything();
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestions = useSmartSuggestions(input);

  // Prefixes rather than replaces — the suggestion only ever appears once
  // there's already text in the box, so overwriting it would destroy what
  // the user typed.
  function applySuggestion(phrase: string) {
    setInput((prev) => (prev.startsWith(phrase) ? prev : phrase + prev));
    textareaRef.current?.focus();
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      const isModK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (!isModK) return;
      e.preventDefault();
      textareaRef.current?.focus();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || loading) return;

    setInput("");
    const result = await submit(message);
    turnIdCounter += 1;
    setTurns((t) => [...t, { id: turnIdCounter, userMessage: message, result }]);
  }

  function handleTextareaKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {turns.length === 0 ? (
          <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
              <Sparkles className="h-6 w-6" aria-hidden="true" />
            </span>
            <h1 className="mt-4 text-xl font-bold text-foreground">AI Assistant</h1>
            <p className="mt-2 text-sm text-muted">
              Describe anything — a product idea, a trade, feedback from a
              user, a metric — and it lands in the right module
              automatically.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-6">
            {turns.map((turn) => (
              <div key={turn.id} className="space-y-3">
                <div className="flex items-start justify-end gap-2">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-orange-500 px-4 py-2.5 text-sm text-black">
                    {turn.userMessage}
                  </div>
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-panel text-xs font-semibold text-muted"
                    aria-hidden="true"
                  >
                    {userInitial}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-400"
                    aria-hidden="true"
                  >
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <ResultBubble result={turn.result} />
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-border p-4 sm:p-6">
        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder="Ask me anything..."
              rows={1}
              className="max-h-40 min-h-[52px] w-full resize-none rounded-2xl border border-border bg-panel px-4 py-3.5 pr-14 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted focus:border-orange-500/60"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.4)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
          <SmartSuggestions
            modules={suggestions.modules}
            visible={suggestions.visible}
            onPick={applySuggestion}
          />
        </form>
      </div>
    </div>
  );
}

function ResultBubble({ result }: { result: CreateResult }) {
  if (result.type === "matched") {
    return (
      <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-emerald-900/60 bg-emerald-500/5 px-4 py-3 text-sm">
        <p className="flex items-center gap-1.5 text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> Logged to{" "}
          {result.moduleTitle}
        </p>
        <p className="mt-1 text-foreground/90">{result.message}</p>
        <Link
          href={result.href}
          className="mt-2 inline-block text-xs text-emerald-400 underline underline-offset-2"
        >
          View {result.moduleTitle.toLowerCase()} →
        </Link>
      </div>
    );
  }

  if (result.type === "unmatched") {
    return (
      <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-orange-900/50 bg-orange-500/5 px-4 py-3 text-sm">
        <p className="flex items-center gap-1.5 text-orange-400">
          <AlertCircle className="h-4 w-4 shrink-0" /> Not sure
        </p>
        <p className="mt-1 text-foreground/90">{result.message}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex items-center justify-center rounded-lg border border-border px-2 py-1 text-[11px] text-muted transition-colors duration-150 hover:border-orange-500 hover:text-orange-400"
            >
              {item.label.toLowerCase()}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-red-900/60 bg-red-500/5 px-4 py-3 text-sm text-red-400">
      <p className="flex items-center gap-1.5">
        <XCircle className="h-4 w-4 shrink-0" /> {result.message}
      </p>
    </div>
  );
}
