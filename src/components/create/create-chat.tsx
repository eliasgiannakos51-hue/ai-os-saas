"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUp, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { NAV_ITEMS } from "@/lib/modules";
import { useCreateAnything, type CreateResult } from "@/lib/use-create-anything";

export function CreateChat({ showHeading = true }: { showHeading?: boolean }) {
  const { submit, loading } = useCreateAnything();
  const [input, setInput] = useState("");
  const [result, setResult] = useState<CreateResult | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
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
    if (!message) return;

    setResult(null);
    const outcome = await submit(message);
    setResult(outcome);
    if (outcome.type !== "error") {
      setInput("");
    }
  }

  return (
    <div className="w-full">
      {showHeading && (
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">AI Assistant</h1>
          <p className="mt-2 text-sm text-muted">
            Describe anything — a product idea, a trade, feedback from a user,
            a metric — and it lands in the right module automatically.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your idea in detail..."
            rows={4}
            className="min-h-32 w-full resize-none rounded-2xl border border-border bg-panel px-4 py-4 pr-16 text-base text-foreground outline-none transition-colors duration-150 placeholder:text-muted focus:border-orange-500/60"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Send"
            className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.4)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
            ) : (
              <ArrowUp className="h-5 w-5" />
            )}
          </button>
        </div>
      </form>

      {result && (
        <div className="mt-4">
          {result.type === "matched" && (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-900/60 bg-emerald-500/5 p-4 text-sm">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <div className="min-w-0">
                <p className="text-emerald-400">
                  Logged to:{" "}
                  <span className="font-semibold">{result.moduleTitle}</span>
                </p>
                <p className="mt-1 text-foreground/90">{result.message}</p>
                <Link
                  href={result.href}
                  className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-lg border border-emerald-900/60 px-3 py-1.5 text-xs text-emerald-400 transition-colors duration-150 hover:border-emerald-500 sm:min-h-0"
                >
                  View {result.moduleTitle.toLowerCase()} →
                </Link>
              </div>
            </div>
          )}

          {result.type === "unmatched" && (
            <div className="flex items-start gap-3 rounded-2xl border border-orange-900/50 bg-orange-500/5 p-4 text-sm">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-orange-400" />
              <div className="min-w-0">
                <p className="text-foreground/90">{result.message}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {NAV_ITEMS.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border px-3 py-1 text-xs text-muted transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 sm:min-h-0 sm:px-2.5"
                    >
                      {item.label.toLowerCase()}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          {result.type === "error" && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-900/60 bg-red-500/5 p-4 text-sm text-red-400">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{result.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
